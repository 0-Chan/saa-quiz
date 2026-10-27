import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateChangelog, validatePack, validateVersions } from "./release-validation.mjs";
import { smokeInstall } from "./package-smoke.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: 15_000 }).trim();
const meta = await import(pathToFileURL(join(root, "dist/meta.js")));
const pkg = readJson("package.json");
const tag = process.env.RELEASE_TAG;
const cliVersion = execFileSync(process.execPath, [join(root, "dist/cli.js"), "--version"], { encoding: "utf8", timeout: 10_000 }).trim();
validateVersions(pkg, readJson("package-lock.json"), meta, cliVersion, tag);
assert.ok(statSync(join(root, "dist/cli.js")).mode & 0o111, "Built CLI is not executable");
const sha = git("rev-parse", "HEAD");
const repository = pkg.repository.url.replace(/^git\+https:\/\/github\.com\//, "").replace(/\.git$/, "");
assert.match(repository, /^[\w.-]+\/[\w.-]+$/, "Expected a GitHub repository URL");
if (tag !== undefined) {
  validateChangelog(readFileSync(join(root, "CHANGELOG.md"), "utf8"), meta.VERSION);
  assert.equal(git("cat-file", "-t", "refs/tags/" + tag), "tag", "Release tag must be annotated");
  assert.equal(git("rev-parse", "refs/tags/" + tag + "^{}"), sha, "Checkout differs from release tag");
  git("merge-base", "--is-ancestor", sha, "refs/remotes/origin/main");
  if (process.env.GITHUB_SHA) assert.equal(sha, process.env.GITHUB_SHA, "GitHub event commit differs from checkout");
}

const temp = mkdtempSync(join(tmpdir(), "release-pack-"));
// npm 11 prints an array; npm 12 an object keyed by package name.
const packed = JSON.parse(execFileSync("npm", ["pack", "--json", "--pack-destination", temp], { cwd: root, encoding: "utf8", timeout: 60_000 }));
const pack = Array.isArray(packed) ? packed[0] : Object.values(packed)[0];
const builtFiles = readdirSync(join(root, "src"), { recursive: true })
  .filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts"))
  .map((path) => "dist/" + path.replace(/\.ts$/, ".js"));
validatePack(pack, ["package.json", "README.md", "LICENSE", "CHANGELOG.md", ...builtFiles], meta);
const tarball = join(temp, pack.filename);
const digest = createHash("sha512").update(readFileSync(tarball)).digest();
assert.equal(pack.integrity, "sha512-" + digest.toString("base64"));
await smokeInstall(tarball, meta);

const manifest = {
  name: meta.APP_NAME, command: meta.COMMAND, version: meta.VERSION,
  tarball, integrity: pack.integrity, sha512: digest.toString("hex"), sha, repository, tag,
};
const manifestPath = resolve(process.env.RELEASE_MANIFEST || join(temp, "manifest.json"));
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("PASS release package: " + pack.entryCount + " files; manifest " + manifestPath);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
  "\n- Validated package: `" + manifest.name + "@" + manifest.version + "`\n- Node: `" + process.version + "`\n- Files: " + pack.entryCount + "\n- Installed CLI checks: 10 passed\n");
