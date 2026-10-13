import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadResets, saveResets } from "./resets.js";

let root: string;
let env: Record<string, string>;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "saa-resets-"));
  env = { SAA_DATA_DIR: root };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("resets store", () => {
  it("treats a missing file as empty", async () => {
    expect(await loadResets(env)).toEqual({ state: { asked: [], resets: [] }, warning: null });
  });

  it("round-trips with quoted timestamps", async () => {
    const state = { asked: [-10, -30], resets: [{ at: "2026-10-12T17:00:00+09:00", adjust: 31 }] };
    await saveResets(state, env);
    expect(await readFile(join(root, "xp-resets.md"), "utf8")).toMatch(/at: '2026-10-12T17:00:00\+09:00'|at: "2026-10-12T17:00:00\+09:00"/);
    expect(await loadResets(env)).toEqual({ state, warning: null });
  });

  it("warns and falls back to empty on a malformed file", async () => {
    await writeFile(join(root, "xp-resets.md"), "---\nasked: nope\n---\n");
    const { state, warning } = await loadResets(env);
    expect(state).toEqual({ asked: [], resets: [] });
    expect(warning).toContain("xp-resets.md");
  });
});
