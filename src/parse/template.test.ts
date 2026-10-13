import { describe, expect, it } from "vitest";
import { TEMPLATE, parseTemplate } from "./template.js";

function fill({ stem = "", choices = "", answer = "", explanation = "" }) {
  return `## 문제\n${stem}\n\n## 선택지\n${choices}\n\n## 정답\n(예: B 또는 B, D)\n${answer}\n\n## 해설 (선택)\n${explanation}\n`;
}

const FOUR = "A. S3\nB. EFS\nC. EBS\nD. FSx";

describe("parseTemplate: success", () => {
  it("parses a single-answer question", () => {
    const r = parseTemplate(fill({ stem: "Which is object storage?", choices: FOUR, answer: "A" }));
    expect(r).toEqual({
      kind: "ok",
      value: { stem: "Which is object storage?", choices: { A: "S3", B: "EFS", C: "EBS", D: "FSx" }, answer: ["A"], explanation: "" },
    });
  });

  it("parses multiple answers separated by commas and/or spaces", () => {
    for (const answer of ["B, D", "B D", "B,D", " d ,  b "]) {
      const r = parseTemplate(fill({ stem: "q", choices: FOUR, answer }));
      expect(r.kind === "ok" && r.value.answer).toEqual(["B", "D"]);
    }
  });

  it("accepts A) style labels and lowercase labels", () => {
    const r = parseTemplate(fill({ stem: "q", choices: "a) one\nb) two", answer: "b" }));
    expect(r.kind === "ok" && r.value).toMatchObject({ choices: { A: "one", B: "two" }, answer: ["B"] });
  });

  it("keeps a multi-line stem and explanation, and joins wrapped choices", () => {
    const r = parseTemplate(
      fill({ stem: "line 1\nline 2", choices: "A. first part\n   continued\nB. two", answer: "A", explanation: "because\nreasons" }),
    );
    expect(r.kind === "ok" && r.value).toMatchObject({
      stem: "line 1\nline 2",
      choices: { A: "first part continued", B: "two" },
      explanation: "because\nreasons",
    });
  });

  it("ignores empty template choice slots", () => {
    const r = parseTemplate(fill({ stem: "q", choices: "A. yes\nB. no\nC. \nD. ", answer: "A" }));
    expect(r.kind === "ok" && Object.keys(r.value.choices)).toEqual(["A", "B"]);
  });

  it("accepts the header without '(선택)'", () => {
    const text = "## 문제\nq\n## 선택지\nA. 1\nB. 2\n## 정답\nA\n## 해설\nnote";
    expect(parseTemplate(text)).toMatchObject({ kind: "ok", value: { explanation: "note" } });
  });
});

describe("parseTemplate: cancel", () => {
  it("treats the untouched template as cancel", () => {
    expect(parseTemplate(TEMPLATE)).toEqual({ kind: "cancel" });
  });

  it("treats an empty file as cancel", () => {
    expect(parseTemplate("")).toEqual({ kind: "cancel" });
  });
});

describe("parseTemplate: failures", () => {
  const errorsOf = (text: string) => {
    const r = parseTemplate(text);
    return r.kind === "invalid" ? r.errors.join("\n") : `unexpected ${r.kind}`;
  };

  it("rejects an empty stem", () => {
    expect(errorsOf(fill({ choices: FOUR, answer: "A" }))).toContain("지문이 비어 있습니다");
  });

  it("rejects fewer than two choices", () => {
    expect(errorsOf(fill({ stem: "q", choices: "A. only", answer: "A" }))).toContain("2개 이상");
  });

  it("rejects duplicate labels", () => {
    expect(errorsOf(fill({ stem: "q", choices: "A. 1\nA. 2\nB. 3", answer: "B" }))).toContain("중복됩니다: A");
  });

  it("rejects answer labels that are not choices", () => {
    expect(errorsOf(fill({ stem: "q", choices: FOUR, answer: "B, E" }))).toContain("선택지에 없습니다: E");
  });

  it("rejects a missing answer", () => {
    expect(errorsOf(fill({ stem: "q", choices: FOUR }))).toContain("정답을 입력하세요");
  });

  it("rejects stray text before the first choice label", () => {
    expect(errorsOf(fill({ stem: "q", choices: "S3\nA. 1\nB. 2", answer: "A" }))).toContain('"A." 또는 "A)"');
  });

  it("reports several problems at once", () => {
    const r = parseTemplate(fill({ choices: "A. 1", answer: "Z" }));
    expect(r.kind === "invalid" && r.errors.length).toBeGreaterThanOrEqual(3);
  });
});
