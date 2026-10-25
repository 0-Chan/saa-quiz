import { describe, expect, it } from "vitest";
import { existingPackageStatus, validateChangelog, validatePack, validateProvenance, validateVersions } from "./release-validation.mjs";

const meta = { APP_NAME: "fixture-package", COMMAND: "fixture", VERSION: "1.2.3" };
const integrity = "sha512-" + Buffer.alloc(64, 7).toString("base64");
const files = ["package.json", "README.md", "LICENSE", "CHANGELOG.md", "dist/cli.js"];
const versions = () => {
  const pkg = { name: meta.APP_NAME, version: meta.VERSION, bin: { [meta.COMMAND]: "dist/cli.js" }, engines: { node: ">=22.12.0" } };
  return { pkg, lock: { name: pkg.name, version: pkg.version, packages: { "": structuredClone(pkg) } } };
};
const packed = () => ({
  name: meta.APP_NAME, version: meta.VERSION, filename: meta.APP_NAME + "-" + meta.VERSION + ".tgz", integrity,
  files: files.map((path) => ({ path, mode: path === "dist/cli.js" ? 0o755 : 0o644 })),
});

describe("release versions", () => {
  it("accepts matching package, lockfile, CLI and tag", () => {
    const { pkg, lock } = versions();
    expect(() => validateVersions(pkg, lock, meta, meta.VERSION, "v" + meta.VERSION)).not.toThrow();
    expect(() => validateVersions(pkg, lock, meta, meta.VERSION)).not.toThrow();
  });
  it.each(["package", "lock", "lock root", "CLI"])("rejects a stale %s version", (target) => {
    const { pkg, lock } = versions();
    let cli = meta.VERSION;
    if (target === "package") pkg.version = "1.2.2";
    if (target === "lock") lock.version = "1.2.2";
    if (target === "lock root") lock.packages[""].version = "1.2.2";
    if (target === "CLI") cli = "1.2.2";
    expect(() => validateVersions(pkg, lock, meta, cli)).toThrow(/version differs/);
  });
  it.each(["1.2.3", "v1.2.2", "v01.2.3", "v1.2.3-beta.1", "refs/tags/v1.2.3"])("rejects tag %s", (tag) => {
    const { pkg, lock } = versions();
    expect(() => validateVersions(pkg, lock, meta, meta.VERSION, tag)).toThrow(/tag differs/);
  });
  it("rejects an unexpected package, command or Node requirement", () => {
    let { pkg, lock } = versions();
    pkg.name = "another-package";
    expect(() => validateVersions(pkg, lock, meta, meta.VERSION)).toThrow(/name differs/);
    ({ pkg, lock } = versions());
    pkg.bin = { unrelated: "dist/cli.js" };
    expect(() => validateVersions(pkg, lock, meta, meta.VERSION)).toThrow(/entry point/);
    ({ pkg, lock } = versions());
    lock.packages[""].engines.node = ">=20";
    expect(() => validateVersions(pkg, lock, meta, meta.VERSION)).toThrow(/Node requirements/);
  });
  it("rejects prerelease package versions", () => {
    const { pkg, lock } = versions();
    expect(() => validateVersions(pkg, lock, { ...meta, VERSION: "1.2.3-beta.1" }, meta.VERSION)).toThrow(/stable/);
  });
});

describe("release notes", () => {
  const heading = "## [1.2.3] - 2026-10-25\n### 변경\n- A change.\n";
  const link = "[1.2.3]: https://github.com/owner/repo/compare/v1.2.2...v1.2.3\n";
  it("requires a dated release entry and comparison link", () => {
    expect(() => validateChangelog(heading + link, meta.VERSION)).not.toThrow();
    expect(() => validateChangelog(link, meta.VERSION)).toThrow(/dated/);
    expect(() => validateChangelog(heading, meta.VERSION)).toThrow(/comparison/);
    expect(() => validateChangelog(heading + link.replace("...v1.2.3", "...v1.2.2"), meta.VERSION)).toThrow(/comparison/);
  });
});

describe("package contents", () => {
  it("accepts only the complete expected file set, regardless of listing order", () => {
    const pack = packed();
    pack.files.reverse();
    expect(() => validatePack(pack, files, meta)).not.toThrow();
  });
  it.each(["dist/flows/add.js", "dist/xp.test.js", "questions/aaaaaaaa.md", ".env", "infra/seed-gate/index.mjs", "scripts/check-release.mjs"])("rejects unexpected file %s", (path) => {
    const pack = packed();
    pack.files.push({ path, mode: 0o644 });
    expect(() => validatePack(pack, files, meta)).toThrow(/unexpected files/);
  });
  it("rejects missing files and duplicate paths", () => {
    let pack = packed();
    pack.files.pop();
    expect(() => validatePack(pack, files, meta)).toThrow(/missing/);
    pack = packed();
    pack.files.push(pack.files[0]);
    expect(() => validatePack(pack, files, meta)).toThrow(/unexpected files/);
  });
  it("rejects a nonexecutable command", () => {
    const pack = packed();
    pack.files.find((file) => file.path === "dist/cli.js").mode = 0o644;
    expect(() => validatePack(pack, files, meta)).toThrow(/not executable/);
  });
  it("rejects stale versions, unsafe filenames and absent integrity", () => {
    expect(() => validatePack({ ...packed(), version: "1.2.2" }, files, meta)).toThrow(/version differs/);
    expect(() => validatePack({ ...packed(), filename: "../unexpected.tgz" }, files, meta)).toThrow(/filename/);
    expect(() => validatePack({ ...packed(), integrity: "" }, files, meta)).toThrow(/integrity/);
  });
});

describe("publication retry", () => {
  it("uploads only an absent version", () => {
    expect(existingPackageStatus(null, integrity)).toBe("publish");
  });
  it("verifies an identical existing version without another upload", () => {
    expect(existingPackageStatus({ dist: { integrity } }, integrity)).toBe("verify");
  });
  it("refuses an existing version with different or missing integrity", () => {
    expect(() => existingPackageStatus({ dist: { integrity: "sha512-other" } }, integrity)).toThrow(/different contents/);
    expect(() => existingPackageStatus({}, integrity)).toThrow(/different contents/);
  });
});

describe("provenance identity", () => {
  const expected = { repository: "owner/repo", sha: "a".repeat(40), tag: "v1.2.3", sha512: "b".repeat(128) };
  const statement = () => ({
    predicateType: "https://slsa.dev/provenance/v1",
    subject: [{ digest: { sha512: expected.sha512 } }],
    predicate: { buildDefinition: {
      externalParameters: { workflow: { repository: "https://github.com/owner/repo", path: ".github/workflows/publish.yml", ref: "refs/tags/" + expected.tag } },
      resolvedDependencies: [{ digest: { gitCommit: expected.sha } }],
    } },
  });
  const bundle = (value) => ({ attestations: [{ bundle: { dsseEnvelope: { payload: Buffer.from(JSON.stringify(value)).toString("base64") } } }] });
  it("matches the tarball, repository, workflow, release tag and commit", () => {
    expect(() => validateProvenance(bundle(statement()), expected)).not.toThrow();
  });
  it.each(["repository", "path", "ref"])("rejects another workflow %s", (key) => {
    const value = statement();
    value.predicate.buildDefinition.externalParameters.workflow[key] = "unexpected";
    expect(() => validateProvenance(bundle(value), expected)).toThrow(/differs/);
  });
  it("rejects another commit or tarball", () => {
    let value = statement();
    value.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit = "c".repeat(40);
    expect(() => validateProvenance(bundle(value), expected)).toThrow(/commit differs/);
    value = statement();
    value.subject[0].digest.sha512 = "d".repeat(128);
    expect(() => validateProvenance(bundle(value), expected)).toThrow(/digest differs/);
  });
  it("requires provenance, not only package metadata", () => {
    expect(() => validateProvenance({ attestations: [] }, expected)).toThrow(/Missing/);
    expect(() => validateProvenance(bundle({ predicateType: "unrelated" }), expected)).toThrow(/Missing/);
  });
});
