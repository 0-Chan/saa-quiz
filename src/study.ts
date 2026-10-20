import { localDay } from "./util/time.js";

/** SAA-C03 pace: 65 questions in 130 minutes. */
export const EXAM_PACE_MS = 120_000;
/** Over 10 minutes means the prompt was left open; such attempts are left out of solving time. */
export const IDLE_MS = 600_000;

export interface TimedAttempt {
  at: string;
  ms: number;
}

export interface TimedQuestion {
  attempts: TimedAttempt[];
}

export const isIdle = (ms: number) => ms > IDLE_MS;

/** Solving time an attempt contributes: 0 when idle. The raw ms stays in the record. */
export function countedMs(ms: number): number {
  return isIdle(ms) ? 0 : ms;
}

/** Solving time of every attempt (not just the first) on a local day. */
export function msOnDay(questions: TimedQuestion[], day: string): number {
  let sum = 0;
  for (const q of questions) {
    for (const attempt of q.attempts) if (localDay(attempt.at) === day) sum += countedMs(attempt.ms);
  }
  return sum;
}

export function totalMs(questions: TimedQuestion[]): number {
  return questions.reduce((sum, q) => sum + q.attempts.reduce((s, a) => s + countedMs(a.ms), 0), 0);
}

/** 45초, 1분 12초, 25분, 1시간 5분: seconds only under 10 minutes, rounded down. */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 10) return seconds % 60 ? `${minutes}분 ${seconds % 60}초` : `${minutes}분`;
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours}시간 ${minutes % 60}분` : `${hours}시간`;
}
