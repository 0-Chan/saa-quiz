import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendAttempt, loadAll, saveNew, type Question } from "./questions.js";

let root: string;
let env: Record<string, string>;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "saa-store-"));
  env = { SAA_DATA_DIR: root };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const sample = (overrides: Partial<Question> = {}): Question => ({
  id: "3f9a2c1e",
  createdAt: "2026-10-08T14:32:00+09:00",
  choices: { A: "S3: object storage", B: "EFS", C: "EBS", D: "FSx" },
  answer: ["B"],
  services: [],
  attempts: [],
  stem: "Which is shared file storage?\nSecond line.",
  explanation: "EFS is NFS.",
  ...overrides,
});

describe("store round trip", () => {
  it("saves, loads, and appends attempts", async () => {
    expect(await saveNew(sample(), env)).toBe("saved");

    let { questions, warnings } = await loadAll(env);
    expect(warnings).toEqual([]);
    expect(questions).toEqual([sample()]);

    const attempt = { at: "2026-10-08T15:01:00+09:00", answer: ["D"], correct: false, confidence: 3, ms: 48210 };
    await appendAttempt("3f9a2c1e", attempt, env);
    await appendAttempt("3f9a2c1e", { ...attempt, answer: ["B"], correct: true }, env);

    ({ questions } = await loadAll(env));
    expect(questions[0]!.attempts).toHaveLength(2);
    expect(questions[0]!.attempts[1]).toMatchObject({ answer: ["B"], correct: true });
    expect(questions[0]!.stem).toBe(sample().stem);
  });

  it("keeps services and domain through appendAttempt; files without tags load with none", async () => {
    await saveNew(sample({ services: ["EFS", "EC2"], domain: "resilient" }), env);
    await saveNew(sample({ id: "0000aaaa" }), env);
    await appendAttempt("3f9a2c1e", { at: "2026-10-08T15:01:00+09:00", answer: ["B"], correct: true, confidence: 2, ms: 1 }, env);
    const { questions } = await loadAll(env);
    expect(questions.find((q) => q.id === "3f9a2c1e")).toMatchObject({ services: ["EFS", "EC2"], domain: "resilient" });
    const untagged = questions.find((q) => q.id === "0000aaaa")!;
    expect(untagged.services).toEqual([]);
    expect(untagged.domain).toBeUndefined();
    const text = await readFile(join(root, "questions", "0000aaaa.md"), "utf8");
    expect(text).not.toContain("services");
  });

  it("writes timestamps as quoted strings", async () => {
    await saveNew(sample(), env);
    const text = await readFile(join(root, "questions", "3f9a2c1e.md"), "utf8");
    expect(text).toContain("createdAt: '2026-10-08T14:32:00+09:00'");
  });

  it("keeps an empty explanation empty", async () => {
    await saveNew(sample({ explanation: "" }), env);
    const { questions } = await loadAll(env);
    expect(questions[0]!.explanation).toBe("");
  });

  it("refuses to overwrite an existing id", async () => {
    await saveNew(sample(), env);
    expect(await saveNew(sample({ stem: "changed" }), env)).toBe("exists");
    const { questions } = await loadAll(env);
    expect(questions[0]!.stem).toBe(sample().stem);
  });

  it("creates the questions folder when missing", async () => {
    const { questions } = await loadAll(env);
    expect(questions).toEqual([]);
    expect(await readdir(root)).toContain("questions");
  });
});

describe("hand-edited and broken files", () => {
  const write = (name: string, text: string) => writeFile(join(root, "questions", name), text);

  it("accepts unquoted timestamps that YAML parses as Date", async () => {
    await loadAll(env);
    await write(
      "aaaaaaaa.md",
      "---\nid: aaaaaaaa\ncreatedAt: 2026-10-08T14:32:00+09:00\nchoices: { A: one, B: two }\nanswer: [A]\n" +
        "attempts:\n  - { at: 2026-10-08T15:01:00+09:00, answer: [A], correct: true, confidence: 2, ms: 10 }\n---\n## 문제\nq\n",
    );
    const { questions, warnings } = await loadAll(env);
    expect(warnings).toEqual([]);
    expect(typeof questions[0]!.createdAt).toBe("string");
    expect(new Date(questions[0]!.attempts[0]!.at).toISOString()).toBe("2026-10-08T06:01:00.000Z");
  });

  it("skips broken files with one warning each and keeps the good ones", async () => {
    await saveNew(sample(), env);
    await write("bbbbbbbb.md", "---\nid: [unclosed\n---\n");
    await write("cccccccc.md", "---\nid: cccccccc\ncreatedAt: x\nchoices: { A: one }\nanswer: [Z]\n---\n");
    await write("dddddddd.md", "---\nid: dddddddd\ncreatedAt: x\nchoices: { A: 1, B: 2 }\nanswer: [A]\n" +
      "attempts: [{ at: x, answer: [A], correct: true, confidence: 5, ms: 1 }]\n---\n");
    await write("notes.txt", "ignored");

    const { questions, warnings } = await loadAll(env);
    expect(questions.map((q) => q.id)).toEqual(["3f9a2c1e"]);
    expect(warnings).toHaveLength(3);
    for (const w of warnings) expect(w.split("\n")).toHaveLength(1);
    expect(warnings.join()).toContain("dddddddd.md");
  });

  it("warns when the file name does not match the id", async () => {
    await saveNew(sample(), env);
    const text = await readFile(join(root, "questions", "3f9a2c1e.md"), "utf8");
    await write("eeeeeeee.md", text);
    const { warnings } = await loadAll(env);
    expect(warnings[0]).toContain("eeeeeeee.md");
  });
});
