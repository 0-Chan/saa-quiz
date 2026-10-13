import { describe, expect, it } from "vitest";
import { attemptXps, crossedMilestone, crossedNegativeMilestones, cumulativeXp, earnsXp, isCorrect, milestone, points, totalXp, xpOnDay, type XpAttempt } from "./xp.js";

const at = (iso: string, correct: boolean, confidence: number): XpAttempt => ({ at: iso, correct, confidence });

describe("CBM points", () => {
  it.each([
    [3, true, 3],
    [3, false, -2],
    [2, true, 2],
    [2, false, -1],
    [1, true, 1],
    [1, false, 0],
  ])("confidence %i, correct=%s → %i", (confidence, correct, expected) => {
    expect(points(confidence, correct)).toBe(expected);
  });

  it("rejects confidence outside 1-3", () => {
    expect(() => points(0, true)).toThrow(RangeError);
    expect(() => points(4, true)).toThrow(RangeError);
  });
});

describe("isCorrect", () => {
  it("single answer", () => {
    expect(isCorrect(["B"], ["B"])).toBe(true);
    expect(isCorrect(["A"], ["B"])).toBe(false);
  });

  it("multiple answers must match exactly, in any order", () => {
    expect(isCorrect(["D", "B"], ["B", "D"])).toBe(true);
    expect(isCorrect(["B"], ["B", "D"])).toBe(false); // partial
    expect(isCorrect(["B", "D", "A"], ["B", "D"])).toBe(false); // one extra
    expect(isCorrect(["B", "C"], ["B", "D"])).toBe(false); // one wrong
    expect(isCorrect([], ["B"])).toBe(false);
  });
});

describe("first attempt per day", () => {
  it("only the first attempt of a local day earns XP", () => {
    const q = {
      attempts: [
        at("2026-10-08T09:00:00+09:00", false, 3),
        at("2026-10-08T10:00:00+09:00", true, 3),
        at("2026-10-08T23:00:00+09:00", true, 3),
      ],
    };
    expect(attemptXps(q)).toEqual([-2, 0, 0]);
    expect(totalXp([q])).toBe(-2);
  });

  it("23:59 and 00:01 the next day are both first attempts", () => {
    const q = { attempts: [at("2026-10-08T23:59:00+09:00", true, 2), at("2026-10-09T00:01:00+09:00", true, 3)] };
    expect(attemptXps(q)).toEqual([2, 3]);
  });

  it("uses the recorded local date even when the UTC date differs", () => {
    // 2026-10-09T00:30+09:00 is still 2026-10-08 in UTC, but a different local day.
    const q = { attempts: [at("2026-10-08T20:00:00+09:00", true, 1), at("2026-10-09T00:30:00+09:00", true, 1)] };
    expect(attemptXps(q)).toEqual([1, 1]);
  });

  it("is tracked per question", () => {
    const a = { attempts: [at("2026-10-08T09:00:00+09:00", true, 3)] };
    const b = { attempts: [at("2026-10-08T09:05:00+09:00", true, 3)] };
    expect(totalXp([a, b])).toBe(6);
  });

  it("earnsXp is false once the question was attempted today", () => {
    const q = { attempts: [at("2026-10-08T09:00:00+09:00", true, 3)] };
    expect(earnsXp(q, "2026-10-08T22:00:00+09:00")).toBe(false);
    expect(earnsXp(q, "2026-10-09T00:00:00+09:00")).toBe(true);
    expect(earnsXp({ attempts: [] }, "2026-10-08T09:00:00+09:00")).toBe(true);
  });
});

describe("totals", () => {
  it("total XP can go negative", () => {
    const q = { attempts: [at("2026-10-08T09:00:00+09:00", false, 3), at("2026-10-09T09:00:00+09:00", false, 2)] };
    expect(totalXp([q])).toBe(-3);
  });

  it("xpOnDay sums only that local day, excluding repeat attempts", () => {
    const q1 = { attempts: [at("2026-10-07T09:00:00+09:00", true, 3), at("2026-10-08T09:00:00+09:00", true, 2), at("2026-10-08T10:00:00+09:00", false, 3)] };
    const q2 = { attempts: [at("2026-10-08T11:00:00+09:00", false, 1)] };
    expect(xpOnDay([q1, q2], "2026-10-08")).toBe(2);
    expect(xpOnDay([q1, q2], "2026-10-07")).toBe(3);
    expect(totalXp([])).toBe(0);
  });
});

describe("XP milestones", () => {
  it("follows 5n(n+1)", () => {
    expect([1, 2, 3, 4, 5].map(milestone)).toEqual([10, 30, 60, 100, 150]);
  });

  it.each([
    [9, 10, 10],
    [10, 12, null],
    [8, 31, 30],
    [12, 6, null],
    [-5, 3, null],
    [28, 31, 30],
    [0, 0, null],
    [57, 60, 60],
  ])("%i → %i crosses %s", (before, after, expected) => {
    expect(crossedMilestone(before, after)).toBe(expected);
  });
});

describe("negative milestones", () => {
  it.each([
    [-9, -10, [-10]],
    [-10, -12, []],
    [-5, -31, [-10, -30]],
    [0, -6, []],
    [-12, -8, []],
    [4, -10, [-10]],
    [-29, -60, [-30, -60]],
  ])("%i → %i crosses %j", (before, after, expected) => {
    expect(crossedNegativeMilestones(before, after)).toEqual(expected);
  });

  it("cumulativeXp adds reset adjustments so a reset lands exactly on 0", () => {
    const qs = [{ attempts: [at("2026-10-01T10:00:00+09:00", false, 3), at("2026-10-02T10:00:00+09:00", false, 3)] }];
    expect(cumulativeXp(qs, [])).toBe(-4);
    expect(cumulativeXp(qs, [{ adjust: 4 }])).toBe(0);
    expect(cumulativeXp(qs, [{ adjust: 4 }, { adjust: 5 }])).toBe(5);
  });
});
