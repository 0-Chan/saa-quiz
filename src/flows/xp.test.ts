import { describe, expect, it } from "vitest";
import { accuracyLine, renderSections } from "./xp.js";

describe("renderSections", () => {
  it("aligns labels across sections and drops empty ones", () => {
    const text = renderSections([
      { title: "XP", rows: [["누적 XP", "96"]] },
      { title: "약점", rows: [] },
      { title: "풀이 시간", rows: [["오늘", "0초"]] },
    ]);
    expect(text).toBe(["XP", "  누적 XP  96", "", "풀이 시간", "  오늘     0초"].join("\n"));
  });
});

describe("accuracyLine", () => {
  const stat = (attempted: number, correct: number) => ({ name: "전체", attempted, correct, inReview: 0 });

  it("judges the 72% pass line on the shown rate", () => {
    expect(accuracyLine(stat(100, 72))).toBe("72% (72/100) · 합격선 72% 충족");
    expect(accuracyLine(stat(100, 71))).toBe("71% (71/100) · 합격선 72% 미달");
  });

  it("shows a dash before anything is attempted", () => {
    expect(accuracyLine(stat(0, 0))).toBe("-");
  });
});
