import { describe, expect, it } from "vitest";
import { normalize, questionId } from "./hash.js";

const base = { stem: "Which service?", choices: { A: "S3", B: "EFS", C: "EBS" }, answer: ["B"] };

describe("normalize", () => {
  it("trims and collapses whitespace", () => {
    expect(normalize("  a \n\t b   c ")).toBe("a b c");
  });
});

describe("questionId", () => {
  it("is 8 lowercase hex chars", () => {
    expect(questionId(base)).toMatch(/^[0-9a-f]{8}$/);
  });

  it("ignores whitespace differences", () => {
    const spaced = { ...base, stem: "  Which   service?\n", choices: { A: " S3", B: "EFS  ", C: "EBS" } };
    expect(questionId(spaced)).toBe(questionId(base));
  });

  it("ignores choice key order and answer order", () => {
    const a = { stem: "q", choices: { A: "1", B: "2", C: "3" }, answer: ["A", "C"] };
    const b = { stem: "q", choices: { C: "3", A: "1", B: "2" }, answer: ["C", "A"] };
    expect(questionId(a)).toBe(questionId(b));
  });

  it("changes when the answer changes", () => {
    expect(questionId({ ...base, answer: ["A"] })).not.toBe(questionId(base));
  });

  it("changes when the stem or a choice changes", () => {
    expect(questionId({ ...base, stem: "Which other service?" })).not.toBe(questionId(base));
    expect(questionId({ ...base, choices: { ...base.choices, C: "FSx" } })).not.toBe(questionId(base));
  });
});
