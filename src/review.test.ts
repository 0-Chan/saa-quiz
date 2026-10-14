import { describe, expect, it } from "vitest";
import {
  graduated,
  inReview,
  pickReview,
  renderWrongNotes,
  reviewKind,
  reviewSummary,
  tagLine,
  tagStats,
  weakServices,
  type NoteQuestion,
  type ReviewQuestion,
} from "./review.js";

const a = (at: string, correct: boolean, confidence = 2, answer = ["A"]) => ({ at, correct, confidence, answer });
const q = (id: string, attempts: ReturnType<typeof a>[], tags: Partial<ReviewQuestion> = {}): ReviewQuestion => ({ id, attempts, ...tags });

describe("wrong-answer note membership", () => {
  it("never wrong → not in the note, not graduated", () => {
    const x = q("x", [a("2026-10-08T09:00:00+09:00", true)]);
    expect(inReview(x)).toBe(false);
    expect(graduated(x)).toBe(false);
    expect(inReview(q("new", []))).toBe(false);
  });

  it("right again on the same day stays in the note", () => {
    const x = q("x", [a("2026-10-08T09:00:00+09:00", false), a("2026-10-08T23:59:00+09:00", true)]);
    expect(inReview(x)).toBe(true);
    expect(graduated(x)).toBe(false);
  });

  it("right on a later local day graduates", () => {
    const x = q("x", [a("2026-10-08T23:59:00+09:00", false), a("2026-10-09T00:01:00+09:00", true)]);
    expect(inReview(x)).toBe(false);
    expect(graduated(x)).toBe(true);
  });

  it("wrong again after graduating comes back", () => {
    const x = q("x", [a("2026-10-08T09:00:00+09:00", false), a("2026-10-09T09:00:00+09:00", true), a("2026-10-10T09:00:00+09:00", false)]);
    expect(inReview(x)).toBe(true);
  });

  it("classifies by the confidence of the last wrong attempt", () => {
    expect(reviewKind(q("x", [a("2026-10-08T09:00:00+09:00", false, 3)]))).toBe("confident");
    expect(reviewKind(q("x", [a("2026-10-08T09:00:00+09:00", false, 3), a("2026-10-09T09:00:00+09:00", false, 1)]))).toBe("unsure");
  });

  it("summarizes", () => {
    const qs = [
      q("c", [a("2026-10-08T09:00:00+09:00", false, 3)]),
      q("u", [a("2026-10-08T09:00:00+09:00", false, 1)]),
      q("g", [a("2026-10-08T09:00:00+09:00", false), a("2026-10-09T09:00:00+09:00", true)]),
      q("ok", [a("2026-10-08T09:00:00+09:00", true)]),
    ];
    expect(reviewSummary(qs)).toEqual({ total: 2, confident: 1, unsure: 1, graduated: 1 });
  });
});

describe("pickReview", () => {
  const confident = q("c", [a("2026-10-08T09:00:00+09:00", false, 3)]);
  const unsure = q("u", [a("2026-10-08T09:00:00+09:00", false, 1)]);
  const right = q("r", [a("2026-10-08T09:00:00+09:00", true)]);

  it("serves misconceptions first, then gaps, then nothing", () => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (let next = pickReview([right, unsure, confident], seen); next; next = pickReview([right, unsure, confident], seen)) {
      order.push(next.id);
      seen.add(next.id);
    }
    expect(order).toEqual(["c", "u"]);
  });
});

describe("tag stats", () => {
  const qs = [
    q("1", [a("2026-10-08T09:00:00+09:00", false)], { services: ["RDS", "Aurora"], domain: "resilient" }),
    q("2", [a("2026-10-08T09:00:00+09:00", true)], { services: ["RDS"], domain: "resilient" }),
    q("3", [a("2026-10-08T09:00:00+09:00", false), a("2026-10-09T09:00:00+09:00", true)], { services: ["RDS"], domain: "cost" }),
    q("4", [], { services: ["RDS"], domain: "cost" }), // never attempted
    q("5", [a("2026-10-08T09:00:00+09:00", false)]), // untagged
  ];

  it("counts attempted questions by last attempt, skipping untagged and unattempted ones", () => {
    const { services, domains } = tagStats(qs);
    expect(services.find((s) => s.name === "RDS")).toEqual({ name: "RDS", attempted: 3, correct: 2, inReview: 1 });
    expect(services.find((s) => s.name === "Aurora")).toEqual({ name: "Aurora", attempted: 1, correct: 0, inReview: 1 });
    expect(domains.map((d) => d.name)).toEqual(["복원력", "비용"]);
  });

  it("weakServices needs a minimum number of attempted questions", () => {
    const { services } = tagStats(qs);
    expect(weakServices(services).map((s) => s.name)).toEqual(["RDS"]);
    expect(weakServices(services, 1).map((s) => s.name)).toEqual(["Aurora", "RDS"]);
  });

  it("tagLine joins services and the domain label", () => {
    expect(tagLine({ services: ["RDS", "Aurora"], domain: "resilient" })).toBe("RDS · Aurora · 복원력");
    expect(tagLine({ services: [] })).toBe("");
  });
});

describe("renderWrongNotes", () => {
  const note = (id: string, attempts: ReturnType<typeof a>[], extra: Partial<NoteQuestion> = {}): NoteQuestion => ({
    id,
    attempts,
    stem: `stem ${id}`,
    choices: { A: "alpha", B: "beta" },
    answer: ["B"],
    explanation: `why ${id}`,
    ...extra,
  });

  it("groups open questions by kind and lists the answer history", () => {
    const text = renderWrongNotes(
      [
        note("conf0001", [a("2026-10-08T09:00:00+09:00", false, 3)], { services: ["S3"], domain: "cost" }),
        note("unsu0001", [a("2026-10-08T09:00:00+09:00", false, 1), a("2026-10-08T10:00:00+09:00", true, 2, ["B"])]),
        note("grad0001", [a("2026-10-08T09:00:00+09:00", false), a("2026-10-09T09:00:00+09:00", true, 2, ["B"])]),
      ],
      "2026-10-14T12:00:00+09:00",
    );
    expect(text).toContain("남은 오답 2문제 (확실인데 틀림 1 / 몰라서 틀림 1), 졸업 1문제.");
    expect(text).toContain("| S3 | 1 | 0% (0/1) |");
    expect(text.indexOf("## 확실인데 틀림")).toBeLessThan(text.indexOf("## 몰라서 틀림"));
    expect(text).toContain("### conf0001 · S3 · 비용");
    expect(text).toContain("- 내 선택: 2026-10-08 A(자신 없음) ✗ → 2026-10-08 B(애매) ✓");
    expect(text).not.toContain("grad0001");
  });

  it("an empty note still has the summary and no sections", () => {
    const text = renderWrongNotes([], "2026-10-14T12:00:00+09:00");
    expect(text).toContain("남은 오답 0문제");
    expect(text).not.toContain("## ");
  });
});
