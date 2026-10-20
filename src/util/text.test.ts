import { describe, expect, it } from "vitest";
import { displayWidth, padLabel } from "./text.js";

describe("displayWidth", () => {
  it("counts Hangul as two columns", () => {
    expect(displayWidth("XP")).toBe(2);
    expect(displayWidth("누적 XP")).toBe(7);
    expect(displayWidth("")).toBe(0);
  });

  it("padLabel pads to the column width, never truncates", () => {
    expect(padLabel("오늘", 6)).toBe("오늘  ");
    expect(padLabel("도메인별 정답률", 4)).toBe("도메인별 정답률");
  });
});
