import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildBundled, fetchBundleWithCode, hasQuestions, readBundleFile, saveBundle, type Bundle, type SourceQuestion } from "./seed.js";
import { loadAll } from "./store/questions.js";
import { normalizeCode } from "./util/code.js";

const at = "2026-10-13T09:00:00+09:00";

const bundle: Bundle = {
  questions: [
    { id: 1, stem: "Q one", options: { A: "a", B: "b" } },
    { id: 2, stem: "Q two", options: { A: "a", B: "b", C: "c" } },
    { id: 3, stem: "Q three", options: { A: "", B: "", C: "" } },
  ],
  answers: [
    { id: 1, answer: ["B"], confidence: "high", rationale_ko: "해설1" },
    { id: 2, answer: ["C", "A"], confidence: "medium", rationale_ko: "해설2" },
    { id: 3, answer: ["A"], confidence: "low", rationale_ko: "해설3" },
  ],
};

const respond = (body: string, status = 200) => (async () => new Response(body, { status })) as unknown as typeof fetch;

describe("normalizeCode", () => {
  it("ignores case, surrounding spaces, and spaces between words", () => {
    expect(normalizeCode("  Alpha Beta  GAMMA 01 ")).toBe("alpha-beta-gamma-01");
    expect(normalizeCode("alpha-beta-gamma-01")).toBe("alpha-beta-gamma-01");
  });
});

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

describe("fetchBundleWithCode", () => {
  it("sends the normalized code and parses the bundle", async () => {
    let sent: RequestInit | undefined;
    const spy = (async (_url: string, init: RequestInit) => ((sent = init), new Response(JSON.stringify(bundle)))) as unknown as typeof fetch;
    const result = await fetchBundleWithCode(" Alpha Beta ", spy, "https://gate.test/");
    expect(result.ok).toBe(true);
    expect(JSON.parse(String(sent?.body))).toEqual({ code: "alpha-beta" });
    expect(sent?.method).toBe("POST");
  });
  it("treats 403 as a wrong code", async () => {
    expect(await fetchBundleWithCode("x", respond("forbidden", 403))).toEqual({ ok: false, reason: "코드가 틀렸습니다", wrongCode: true });
  });
  it("reports other HTTP errors and network failures without throwing", async () => {
    expect(await fetchBundleWithCode("x", respond("oops", 500))).toEqual({ ok: false, reason: "HTTP 500", wrongCode: false });
    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await fetchBundleWithCode("x", offline)).toEqual({ ok: false, reason: "fetch failed", wrongCode: false });
  });
  it("rejects a malformed bundle", async () => {
    expect(await fetchBundleWithCode("x", respond(JSON.stringify({ questions: "nope" })))).toEqual({
      ok: false,
      reason: "번들 형식 오류",
      wrongCode: false,
    });
  });
});

describe("saving a bundle", () => {
  let root: string;
  let env: Record<string, string>;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "saa-seed-"));
    env = { SAA_DATA_DIR: root };
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reads a local bundle, saves it once, and reports the folder as non-empty", async () => {
    const file = join(root, "bundle.json");
    await writeFile(file, JSON.stringify(bundle));
    const result = await readBundleFile(file);
    if (!result.ok) throw new Error(result.reason);
    expect(await hasQuestions(env)).toBe(false);
    expect(await saveBundle(result.bundle, at, env)).toBe(2);
    expect(await hasQuestions(env)).toBe(true);
    expect(await saveBundle(result.bundle, at, env)).toBe(0);
    const { questions, warnings } = await loadAll(env);
    expect([questions.length, warnings]).toEqual([2, []]);
  });

  it("reports a missing file without throwing", async () => {
    expect(await readBundleFile(join(root, "nope.json"))).toMatchObject({ ok: false, wrongCode: false });
  });
});
