import assert from "node:assert/strict";

const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** These checks take data only so failure cases can be tested without npm or GitHub. */
export function validateVersions(pkg, lock, meta, cliVersion, tag) {
  assert.ok(stable.test(meta.VERSION), "A stable X.Y.Z version is required");
  assert.equal(pkg.name, meta.APP_NAME, "Package name differs from meta");
  assert.equal(lock.name, meta.APP_NAME, "Lockfile name differs from meta");
  assert.equal(lock.packages?.[""]?.name, meta.APP_NAME, "Lockfile root name differs from meta");
  for (const [label, value] of Object.entries({ package: pkg.version, lock: lock.version, lockRoot: lock.packages?.[""]?.version, cli: cliVersion })) {
    assert.equal(value, meta.VERSION, label + " version differs from meta");
  }
  assert.deepEqual(pkg.bin, { [meta.COMMAND]: "dist/cli.js" }, "Unexpected CLI entry point");
  assert.deepEqual(lock.packages[""].engines, pkg.engines, "Node requirements differ in lockfile");
  if (tag !== undefined) assert.equal(tag, "v" + meta.VERSION, "Release tag differs from package version");
}

export function validateChangelog(text, version) {
  const heading = text.split("\n").find((line) => line.startsWith("## [" + version + "] - "));
  assert.ok(heading && /^## \[[^\]]+\] - \d{4}-\d{2}-\d{2}$/.test(heading), "Missing dated CHANGELOG entry");
  const link = text.split("\n").find((line) => line.startsWith("[" + version + "]: "));
  assert.ok(link?.endsWith("...v" + version) && link.includes("/compare/v"), "Missing CHANGELOG comparison link");
}

export function validatePack(pack, expectedFiles, meta) {
  assert.equal(pack.name, meta.APP_NAME, "Packed package name differs");
  assert.equal(pack.version, meta.VERSION, "Packed version differs");
  assert.match(pack.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/, "Missing tarball integrity");
  assert.equal(pack.filename, meta.APP_NAME.replace("/", "-").replace(/^@/, "") + "-" + meta.VERSION + ".tgz", "Unexpected tarball filename");
  const paths = pack.files.map((entry) => entry.path);
  assert.deepEqual([...paths].sort(), [...expectedFiles].sort(), "Package contains missing or unexpected files");
  assert.ok(pack.files.find((entry) => entry.path === "dist/cli.js")?.mode & 0o111, "CLI is not executable in package");
}

export function existingPackageStatus(published, integrity) {
  if (published === null) return "publish";
  assert.equal(published.dist?.integrity, integrity, "This version is already published with different contents");
  return "verify";
}

export function validateProvenance(attestations, { repository, sha, tag, sha512 }) {
  const statement = attestations.attestations?.flatMap((item) => {
    const payload = item.bundle?.dsseEnvelope?.payload;
    return payload ? [JSON.parse(Buffer.from(payload, "base64").toString("utf8"))] : [];
  }).find((item) => item.predicateType === "https://slsa.dev/provenance/v1");
  assert.ok(statement, "Missing SLSA provenance statement");
  assert.ok(statement.subject?.some((subject) => subject.digest?.sha512 === sha512), "Provenance tarball digest differs");
  const definition = statement.predicate?.buildDefinition;
  assert.equal(definition?.externalParameters?.workflow?.repository, "https://github.com/" + repository, "Provenance repository differs");
  assert.equal(definition?.externalParameters?.workflow?.path, ".github/workflows/publish.yml", "Provenance workflow differs");
  assert.equal(definition?.externalParameters?.workflow?.ref, "refs/tags/" + tag, "Provenance tag differs");
  assert.ok(definition?.resolvedDependencies?.some((dependency) => dependency.digest?.gitCommit === sha), "Provenance commit differs");
}
