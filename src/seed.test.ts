import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildBundled, seedIfEmpty, type Bundle, type SourceQuestion } from "./seed.js";
import { loadAll, saveNew } from "./store/questions.js";

const at = "2026-10-13T09:00:00+09:00";

const bundle: Bundle = {
  questions: [
    { id: 1, stem: "Q one", options: { A: "a", B: "b" } },
    { id: 2, stem: "Q two", options: { A: "a", B: "b", C: "c" } },
    { id: 3, stem: "Q three", options: { A: "a", B: "b", C: "c" } },
  ],
  answers: [
    { id: 1, answer: ["B"], confidence: "high", rationale_ko: "해설1" },
    { id: 2, answer: ["C", "A"], confidence: "medium", rationale_ko: "해설2" },
    { id: 3, answer: ["A"], confidence: "low", rationale_ko: "해설3" },
  ],
};

describe("buildBundled", () => {
  it("skips low confidence, sorts answers, uses the Korean rationale", () => {
    const qs = buildBundled(bundle.questions, bundle.answers, at);
    expect(qs.map((q) => q.stem)).toEqual(["Q one", "Q two"]);
    expect(qs[1]).toMatchObject({ answer: ["A", "C"], explanation: "해설2", createdAt: at, attempts: [] });
    expect(qs[0]!.id).toMatch(/^[0-9a-f]{8}$/);
  });
  it("fails loudly when an answer has no source question", () => {
    const sources: SourceQuestion[] = bundle.questions;
    expect(() => buildBundled(sources, [{ id: 9, answer: ["A"], confidence: "high", rationale_ko: "" }], at)).toThrow("Q9");
  });
});

describe("seedIfEmpty", () => {
  let root: string;
  let env: Record<string, string>;
  const noFetch = (() => {
    throw new Error("fetch should not be called");
  }) as unknown as typeof fetch;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "saa-seed-"));
    env = { SAA_DATA_DIR: root };
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("does nothing without a configured source", async () => {
    expect(await seedIfEmpty(at, env, noFetch)).toEqual({ status: "none" });
  });

  it("loads a local bundle into an empty folder, then skips", async () => {
    const file = join(root, "bundle.json");
    await writeFile(file, JSON.stringify(bundle));
    const withFile = { ...env, SAA_SEED_FILE: file };
    expect(await seedIfEmpty(at, withFile, noFetch)).toEqual({ status: "seeded", count: 2 });
    const { questions, warnings } = await loadAll(env);
    expect([questions.length, warnings]).toEqual([2, []]);
    expect(await seedIfEmpty(at, withFile, noFetch)).toEqual({ status: "skipped" });
  });

  it("loads from a URL", async () => {
    const ok = (async () => new Response(JSON.stringify(bundle))) as unknown as typeof fetch;
    expect(await seedIfEmpty(at, { ...env, SAA_SEED_URL: "https://example.test/b" }, ok)).toEqual({ status: "seeded", count: 2 });
  });

  it("reports an expired URL without throwing", async () => {
    const denied = (async () => new Response("AccessDenied", { status: 403 })) as unknown as typeof fetch;
    const result = await seedIfEmpty(at, { ...env, SAA_SEED_URL: "https://example.test/b" }, denied);
    expect(result).toMatchObject({ status: "failed", reason: expect.stringContaining("403") });
  });

  it("reports a malformed bundle without saving anything", async () => {
    const bad = (async () => new Response(JSON.stringify({ questions: "nope" }))) as unknown as typeof fetch;
    expect(await seedIfEmpty(at, { ...env, SAA_SEED_URL: "https://example.test/b" }, bad)).toEqual({ status: "failed", reason: "번들 형식 오류" });
    expect((await loadAll(env)).questions).toEqual([]);
  });

  it("does not touch a folder that already has questions", async () => {
    await saveNew({ id: "3f9a2c1e", createdAt: at, choices: { A: "x", B: "y" }, answer: ["A"], attempts: [], stem: "s", explanation: "" }, env);
    expect(await seedIfEmpty(at, { ...env, SAA_SEED_FILE: "/nonexistent" }, noFetch)).toEqual({ status: "skipped" });
  });
});
