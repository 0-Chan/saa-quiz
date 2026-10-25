import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { existingPackageStatus, validateProvenance } from "./release-validation.mjs";
import { smokeInstall } from "./package-smoke.mjs";

const registry = "https://registry.npmjs.org";
const manifest = JSON.parse(readFileSync(process.env.RELEASE_MANIFEST, "utf8"));
assert.equal(process.env.GITHUB_ACTIONS, "true", "Publishing is only supported in GitHub Actions");
assert.equal(process.env.GITHUB_EVENT_NAME, "release", "Expected a GitHub Release event");
assert.equal(manifest.tag, process.env.RELEASE_TAG);
assert.equal(manifest.tag, "v" + manifest.version);
assert.equal(manifest.sha, process.env.GITHUB_SHA, "Package was built from another commit");
assert.equal(manifest.repository, process.env.GITHUB_REPOSITORY);
const digest = createHash("sha512").update(readFileSync(manifest.tarball)).digest();
assert.equal("sha512-" + digest.toString("base64"), manifest.integrity, "Tarball changed after validation");
assert.equal(digest.toString("hex"), manifest.sha512);

async function getJson(url, allowMissing = false, timeout = 10_000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { "cache-control": "no-cache" } });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error("Registry request failed: HTTP " + response.status);
  return response.json();
}

const versionUrl = registry + "/" + encodeURIComponent(manifest.name) + "/" + encodeURIComponent(manifest.version);
const status = existingPackageStatus(await getJson(versionUrl, true), manifest.integrity);
if (status === "publish") {
  assert.ok(process.env.ACTIONS_ID_TOKEN_REQUEST_URL && process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, "Missing GitHub OIDC permissions");
  // A tarball publish does not run prepublishOnly. Both Node matrix jobs already passed,
  // and check-release installed and validated this exact tarball in this job.
  execFileSync("npm", ["publish", manifest.tarball, "--access", "public", "--registry", registry], { stdio: "inherit", timeout: 180_000 });
} else {
  console.log("This exact package is already published; verifying it without publishing again.");
}

const deadline = Date.now() + 120_000;
let verified = false;
let lastError;
while (Date.now() < deadline) {
  try {
    const published = await getJson(versionUrl, true, Math.min(10_000, deadline - Date.now()));
    assert.ok(published, "Published version has not propagated yet");
    existingPackageStatus(published, manifest.integrity);
    const url = new URL(published.dist?.attestations?.url);
    assert.equal(url.origin, registry, "Unexpected provenance host");
    const attestations = await getJson(url, false, Math.max(1, Math.min(10_000, deadline - Date.now())));
    validateProvenance(attestations, manifest);
    if (status === "publish") {
      const tags = await getJson(registry + "/-/package/" + encodeURIComponent(manifest.name) + "/dist-tags", false, Math.max(1, Math.min(10_000, deadline - Date.now())));
      assert.equal(tags.latest, manifest.version, "latest has not propagated yet");
    }
    verified = true;
    break;
  } catch (error) {
    lastError = error;
    if (Date.now() < deadline) await delay(Math.min(5_000, deadline - Date.now()));
  }
}
assert.ok(verified, "Registry/provenance verification failed: " + lastError?.message);
await smokeInstall(manifest.name + "@" + manifest.version, { APP_NAME: manifest.name, COMMAND: manifest.command, VERSION: manifest.version });
const summary = [
  "## npm publication verified",
  "",
  "- Package: [" + manifest.name + "@" + manifest.version + "](https://www.npmjs.com/package/" + manifest.name + "/v/" + manifest.version + ")",
  "- Release: [" + manifest.tag + "](https://github.com/" + manifest.repository + "/releases/tag/" + manifest.tag + ")",
  "- Commit: `" + manifest.sha + "`",
  "- Tarball integrity and provenance workflow/commit: matched",
  "- Installed CLI checks: 10 passed",
  "- Upload: " + (status === "publish" ? "published" : "already published with identical integrity"),
  "",
].join("\n");
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
