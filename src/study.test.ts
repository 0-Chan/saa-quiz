import { describe, expect, it } from "vitest";
import { countedMs, formatDuration, isIdle, msOnDay, totalMs } from "./study.js";

describe("countedMs", () => {
  it.each([
    [599_999, 599_999],
    [600_000, 600_000],
    [600_001, 0],
    [3_600_000, 0],
  ])("%i → %i", (ms, expected) => {
    expect(countedMs(ms)).toBe(expected);
    expect(isIdle(ms)).toBe(expected === 0);
  });
});

describe("solving time totals", () => {
  const q = {
    attempts: [
      { at: "2026-10-08T23:59:00+09:00", ms: 30_000 },
      { at: "2026-10-09T00:01:00+09:00", ms: 45_000 },
      { at: "2026-10-09T10:00:00+09:00", ms: 900_000 }, // idle: left out
    ],
  };

  it("msOnDay counts every attempt of that local day", () => {
    expect(msOnDay([q], "2026-10-08")).toBe(30_000);
    expect(msOnDay([q], "2026-10-09")).toBe(45_000);
    expect(msOnDay([q], "2026-10-10")).toBe(0);
  });

  it("totalMs leaves out idle attempts", () => {
    expect(totalMs([q, { attempts: [] }])).toBe(30_000 + 45_000);
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0초"],
    [999, "0초"],
    [59_999, "59초"],
    [60_000, "1분"],
    [72_000, "1분 12초"],
    [599_000, "9분 59초"],
    [600_000, "10분"],
    [659_000, "10분"],
    [3_540_000, "59분"],
    [3_600_000, "1시간"],
    [3_660_000, "1시간 1분"],
    [11_400_000, "3시간 10분"],
  ])("%i → %s", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});
