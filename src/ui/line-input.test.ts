import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { UserCancelled } from "../util/prompt.js";
import { createLineInput, lineConfirm, lineMultiselect, lineSelect, parseChoice, parseMulti, parseYesNo } from "./line-input.js";

const KEYS = ["A", "B", "C", "D"];

describe("parsing", () => {
  it("parseChoice takes one key, any case", () => {
    expect(parseChoice("b", KEYS)).toEqual({ ok: true, value: 1 });
    expect(parseChoice(" D ", KEYS)).toEqual({ ok: true, value: 3 });
    expect(parseChoice("E", KEYS).ok).toBe(false);
    expect(parseChoice("", KEYS).ok).toBe(false);
    expect(parseChoice("4", ["1", "2", "3", "4"])).toEqual({ ok: true, value: 3 });
  });

  it.each([["A,C"], ["a c"], ["ac"], ["C, a"]])("parseMulti accepts %s", (raw) => {
    expect(parseMulti(raw, KEYS, 2)).toEqual({ ok: true, value: [0, 2] });
  });

  it.each([["A"], ["A,B,C"], ["A,A"], ["A,E"], [""]])("parseMulti rejects %s for two answers", (raw) => {
    expect(parseMulti(raw, KEYS, 2).ok).toBe(false);
  });

  it("parseYesNo with a default for empty input", () => {
    expect(parseYesNo("y", false)).toEqual({ ok: true, value: true });
    expect(parseYesNo("N", true)).toEqual({ ok: true, value: false });
    expect(parseYesNo("", false)).toEqual({ ok: true, value: false });
    expect(parseYesNo("maybe", false).ok).toBe(false);
  });
});

/** Line input fed by `lines`; the stream ends after them (EOF). */
function io(lines: string[]) {
  const input = new PassThrough();
  const output = new PassThrough();
  let written = "";
  output.on("data", (chunk) => (written += chunk));
  input.end(lines.map((l) => `${l}\n`).join(""));
  return { io: createLineInput(input, output), written: () => written };
}

const answers = ["A", "B", "C", "D"].map((k) => ({ value: k, label: `${k}. choice ${k}`, key: k }));

describe("line prompts", () => {
  it("re-asks after invalid input, then takes the letter", async () => {
    const t = io(["x", "b"]);
    expect(await lineSelect(t.io, "답을 고르세요", answers)).toBe("B");
    expect(t.written()).toContain("  B. choice B");
    expect(t.written()).toContain("A-D 중 하나를 입력하세요.");
  });

  it("numbers other menus and returns non-string values", async () => {
    const t = io(["4"]);
    const options = [
      { value: 3, label: "확실", hint: "맞으면 +3 / 틀리면 −2" },
      { value: 2, label: "애매" },
      { value: 1, label: "자신 없음" },
      { value: "back" as const, label: "선택지로 돌아가기" },
    ];
    expect(await lineSelect<number | "back">(t.io, "확신도는?", options)).toBe("back");
    expect(t.written()).toContain("  1. 확실 — 맞으면 +3 / 틀리면 −2");
  });

  it("empty Enter keeps the previous pick", async () => {
    expect(await lineSelect(io([""]).io, "답을 고르세요", answers, "C")).toBe("C");
    expect(await lineMultiselect(io([""]).io, "2개를 고르세요", answers, 2, ["B", "D"])).toEqual(["B", "D"]);
  });

  it("multiselect takes A,C", async () => {
    expect(await lineMultiselect(io(["A,C"]).io, "2개를 고르세요", answers, 2)).toEqual(["A", "C"]);
  });

  it("confirm defaults on empty input", async () => {
    expect(await lineConfirm(io([""]).io, "리셋할까요?", "리셋", "유지", false)).toBe(false);
    expect(await lineConfirm(io(["y"]).io, "리셋할까요?", "리셋", "유지", false)).toBe(true);
  });

  it("EOF cancels instead of hanging", async () => {
    await expect(lineSelect(io([]).io, "답을 고르세요", answers)).rejects.toBeInstanceOf(UserCancelled);
    await expect(lineSelect(io(["x"]).io, "답을 고르세요", answers)).rejects.toBeInstanceOf(UserCancelled);
  });
});
