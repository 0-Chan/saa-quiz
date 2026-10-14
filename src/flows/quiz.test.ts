import { describe, expect, it } from "vitest";
import type { Question } from "../store/questions.js";
import { pickNext } from "./quiz.js";

const q = (id: string, attempts: { at: string; correct: boolean }[] = []): Question => ({
  id,
  createdAt: "2026-10-01T00:00:00+09:00",
  choices: { A: "1", B: "2" },
  answer: ["A"],
  services: [],
  attempts: attempts.map((a) => ({ ...a, answer: ["A"], confidence: 2, ms: 1 })),
  stem: id,
  explanation: "",
});

const first = () => 0;
const last = () => 0.999;

describe("pickNext", () => {
  const fresh = q("fresh");
  const wrong = q("wrong", [{ at: "2026-10-05T09:00:00+09:00", correct: false }]);
  const wrongThenRight = q("fixed", [
    { at: "2026-10-01T09:00:00+09:00", correct: false },
    { at: "2026-10-06T09:00:00+09:00", correct: true },
  ]);
  const oldRight = q("old", [{ at: "2026-10-02T09:00:00+09:00", correct: true }]);
  const all = [oldRight, wrongThenRight, wrong, fresh];

  it("prefers never-attempted, then last-wrong, then oldest last attempt", () => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (let next = pickNext(all, seen, first); next; next = pickNext(all, seen, first)) {
      order.push(next.id);
      seen.add(next.id);
    }
    expect(order).toEqual(["fresh", "wrong", "old", "fixed"]);
  });

  it("uses the last attempt, not any earlier wrong one", () => {
    expect(pickNext([wrongThenRight, wrong], new Set(), first)!.id).toBe("wrong");
  });

  it("picks randomly within a group", () => {
    const pool = [q("a"), q("b"), q("c")];
    expect(pickNext(pool, new Set(), first)!.id).toBe("a");
    expect(pickNext(pool, new Set(), last)!.id).toBe("c");
  });

  it("breaks ties among equally old attempts randomly but never picks a newer one", () => {
    const t = "2026-10-02T09:00:00+09:00";
    const pool = [q("x", [{ at: t, correct: true }]), q("y", [{ at: t, correct: true }]), q("newer", [{ at: "2026-10-03T09:00:00+09:00", correct: true }])];
    expect(pickNext(pool, new Set(), first)!.id).toBe("x");
    expect(pickNext(pool, new Set(), last)!.id).toBe("y");
  });

  it("compares instants across different offsets", () => {
    // 09:00+09:00 (00:00Z) is earlier than 01:00+00:00 (01:00Z).
    const pool = [q("utc", [{ at: "2026-10-02T01:00:00+00:00", correct: true }]), q("kst", [{ at: "2026-10-02T09:00:00+09:00", correct: true }])];
    expect(pickNext(pool, new Set(), first)!.id).toBe("kst");
  });

  it("never repeats within a session and returns null when exhausted", () => {
    expect(pickNext(all, new Set(all.map((x) => x.id)))).toBeNull();
    expect(pickNext([], new Set())).toBeNull();
  });
});
