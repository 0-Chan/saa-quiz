import { localDay } from "./util/time.js";

export type Confidence = 1 | 2 | 3;

/** Certainty-based marking table. Multi-answer questions pay more when right (all labels must match). */
export const CBM: Record<Confidence, { label: string; correct: number; multiCorrect: number; wrong: number }> = {
  3: { label: "확실", correct: 3, multiCorrect: 5, wrong: -2 },
  2: { label: "애매", correct: 2, multiCorrect: 3, wrong: -1 },
  1: { label: "자신 없음", correct: 1, multiCorrect: 1, wrong: 0 },
};

export interface XpAttempt {
  at: string;
  correct: boolean;
  confidence: number;
}

export interface XpQuestion {
  attempts: XpAttempt[];
  /** More than one label → multi-answer scoring. */
  answer?: string[];
}

/** Correct only when the selected labels are exactly the answer set. */
export function isCorrect(selected: string[], answer: string[]): boolean {
  const a = new Set(selected);
  const b = new Set(answer);
  return a.size === b.size && [...a].every((label) => b.has(label));
}

export function points(confidence: number, correct: boolean, multi = false): number {
  const row = CBM[confidence as Confidence];
  if (!row) throw new RangeError(`confidence must be 1-3, got ${confidence}`);
  if (!correct) return row.wrong;
  return multi ? row.multiCorrect : row.correct;
}

export const isMulti = (q: Pick<XpQuestion, "answer">) => (q.answer?.length ?? 1) > 1;

/** XP earned by each attempt, in order: only the first attempt per local day counts. */
export function attemptXps(question: XpQuestion): number[] {
  const seenDays = new Set<string>();
  return question.attempts.map((attempt) => {
    const day = localDay(attempt.at);
    if (seenDays.has(day)) return 0;
    seenDays.add(day);
    return points(attempt.confidence, attempt.correct, isMulti(question));
  });
}

export function totalXp(questions: XpQuestion[]): number {
  return questions.reduce((sum, q) => sum + attemptXps(q).reduce((a, b) => a + b, 0), 0);
}

export function xpOnDay(questions: XpQuestion[], day: string): number {
  let sum = 0;
  for (const q of questions) {
    attemptXps(q).forEach((xp, i) => {
      if (localDay(q.attempts[i]!.at) === day) sum += xp;
    });
  }
  return sum;
}

/** Whether a new attempt at `nowIso` would still earn XP (no attempt yet on that local day). */
export function earnsXp(question: XpQuestion, nowIso: string): boolean {
  const today = localDay(nowIso);
  return !question.attempts.some((attempt) => localDay(attempt.at) === today);
}

/** n-th XP milestone: 5n(n+1) → 10, 30, 60, 100, 150, … */
export function milestone(n: number): number {
  return 5 * n * (n + 1);
}

/** Highest milestone m with before < m ≤ after, or null if total XP crossed none. */
export function crossedMilestone(before: number, after: number): number | null {
  let reached: number | null = null;
  for (let n = 1; milestone(n) <= after; n++) {
    if (milestone(n) > before) reached = milestone(n);
  }
  return reached;
}

/** Negative milestones −a_k that total XP fell through (after ≤ −a_k < before), shallowest first. */
export function crossedNegativeMilestones(before: number, after: number): number[] {
  const crossed: number[] = [];
  for (let n = 1; -milestone(n) >= after; n++) {
    if (-milestone(n) < before) crossed.push(-milestone(n));
  }
  return crossed;
}

/** Total XP including reset adjustments (each reset stores the amount that brought the total to 0). */
export function cumulativeXp(questions: XpQuestion[], resets: { adjust: number }[]): number {
  return totalXp(questions) + resets.reduce((sum, r) => sum + r.adjust, 0);
}
