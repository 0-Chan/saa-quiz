import { localDay } from "./util/time.js";
import { CBM, type Confidence } from "./xp.js";

/** The four SAA-C03 exam domains. */
export const DOMAINS = ["secure", "resilient", "performance", "cost"] as const;
export type Domain = (typeof DOMAINS)[number];
export const DOMAIN_LABEL: Record<Domain, string> = { secure: "보안", resilient: "복원력", performance: "고성능", cost: "비용" };

export interface ReviewAttempt {
  at: string;
  answer: string[];
  correct: boolean;
  confidence: number;
}

export interface ReviewQuestion {
  id: string;
  attempts: ReviewAttempt[];
  services?: string[];
  domain?: Domain;
}

export type ReviewKind = "confident" | "unsure";
export const KIND_LABEL: Record<ReviewKind, string> = { confident: "확실인데 틀림", unsure: "몰라서 틀림" };

function lastWrongIndex(q: ReviewQuestion): number {
  for (let i = q.attempts.length - 1; i >= 0; i--) if (!q.attempts[i]!.correct) return i;
  return -1;
}

/** In the wrong-answer note: some attempt was wrong and no later attempt on a different local day was right. */
export function inReview(q: ReviewQuestion): boolean {
  const i = lastWrongIndex(q);
  if (i < 0) return false;
  const day = localDay(q.attempts[i]!.at);
  return !q.attempts.slice(i + 1).some((a) => a.correct && localDay(a.at) !== day);
}

/** Was in the note once and has since left it. */
export function graduated(q: ReviewQuestion): boolean {
  return lastWrongIndex(q) >= 0 && !inReview(q);
}

/** Wrong while sure (confidence 3) is a misconception; anything else is a gap. */
export function reviewKind(q: ReviewQuestion): ReviewKind {
  const i = lastWrongIndex(q);
  return i >= 0 && q.attempts[i]!.confidence === 3 ? "confident" : "unsure";
}

export interface ReviewSummary {
  total: number;
  confident: number;
  unsure: number;
  graduated: number;
}

export function reviewSummary(questions: ReviewQuestion[]): ReviewSummary {
  const open = questions.filter(inReview);
  const confident = open.filter((q) => reviewKind(q) === "confident").length;
  return { total: open.length, confident, unsure: open.length - confident, graduated: questions.filter(graduated).length };
}

/** Next note question for this session: misconceptions first, random within a group. */
export function pickReview<Q extends ReviewQuestion>(questions: Q[], seen: ReadonlySet<string>, random: () => number = Math.random): Q | null {
  const pool = questions.filter((q) => !seen.has(q.id) && inReview(q));
  const confident = pool.filter((q) => reviewKind(q) === "confident");
  const group = confident.length ? confident : pool;
  return group.length ? group[Math.floor(random() * group.length)]! : null;
}

export interface TagStat {
  name: string;
  attempted: number;
  correct: number;
  inReview: number;
}

const emptyStat = (name: string): TagStat => ({ name, attempted: 0, correct: 0, inReview: 0 });

/** Count one attempted question into `stat`, judged by its last attempt. */
function tally(stat: TagStat, q: ReviewQuestion): TagStat {
  stat.attempted += 1;
  if (q.attempts[q.attempts.length - 1]!.correct) stat.correct += 1;
  if (inReview(q)) stat.inReview += 1;
  return stat;
}

/** All attempted questions, tagged or not, by last attempt. */
export function overallStat(questions: ReviewQuestion[]): TagStat {
  return questions.filter((q) => q.attempts.length).reduce(tally, emptyStat("전체"));
}

/** SAA-C03 passes at 720/1000; read as a 72% accuracy line. */
export const PASS_RATE = 72;
/** Judged on the shown (rounded) rate so the verdict never contradicts the number. */
export const passes = (s: TagStat) => s.attempted > 0 && rate(s) >= PASS_RATE;

/** Per service and per domain: attempted questions, how many were right on the last attempt, how many are in the note. */
export function tagStats(questions: ReviewQuestion[]): { services: TagStat[]; domains: TagStat[] } {
  const services = new Map<string, TagStat>();
  const domains = new Map<string, TagStat>();
  const add = (map: Map<string, TagStat>, name: string, q: ReviewQuestion) => map.set(name, tally(map.get(name) ?? emptyStat(name), q));
  for (const q of questions) {
    if (!q.attempts.length) continue;
    for (const s of q.services ?? []) add(services, s, q);
    if (q.domain) add(domains, DOMAIN_LABEL[q.domain], q);
  }
  const domainOrder = DOMAINS.map((d) => DOMAIN_LABEL[d]);
  return {
    services: [...services.values()],
    domains: [...domains.values()].sort((a, b) => domainOrder.indexOf(a.name) - domainOrder.indexOf(b.name)),
  };
}

export const rate = (s: TagStat) => Math.round((s.correct / s.attempted) * 100);

/** Lowest last-attempt accuracy among services with at least `min` attempted questions. */
export function weakServices(stats: TagStat[], min = 3, count = 3): TagStat[] {
  return stats
    .filter((s) => s.attempted >= min)
    .sort((a, b) => rate(a) - rate(b) || b.attempted - a.attempted || a.name.localeCompare(b.name))
    .slice(0, count);
}

export function tagLine(q: Pick<ReviewQuestion, "services" | "domain">): string {
  return [...(q.services ?? []), ...(q.domain ? [DOMAIN_LABEL[q.domain]] : [])].join(" · ");
}

export interface NoteQuestion extends ReviewQuestion {
  stem: string;
  choices: Record<string, string>;
  answer: string[];
  explanation: string;
}

const confidenceLabel = (c: number) => CBM[c as Confidence]?.label ?? String(c);

function renderEntry(q: NoteQuestion): string {
  const tags = tagLine(q);
  const history = q.attempts
    .map((a) => `${localDay(a.at)} ${[...a.answer].sort().join(", ")}(${confidenceLabel(a.confidence)}) ${a.correct ? "✓" : "✗"}`)
    .join(" → ");
  return [
    `### ${q.id}${tags ? ` · ${tags}` : ""}`,
    q.stem,
    "",
    ...Object.entries(q.choices).map(([label, text]) => `- ${label}. ${text}`),
    "",
    `- 내 선택: ${history}`,
    `- 정답: ${[...q.answer].sort().join(", ")}`,
    ...(q.explanation ? [`- 해설: ${q.explanation}`] : []),
    "",
  ].join("\n");
}

const lastWrongAt = (q: ReviewQuestion) => q.attempts[lastWrongIndex(q)]!.at;

/** wrong-notes.md: summary, per-service table, then misconceptions and gaps (most recent first). */
export function renderWrongNotes(questions: NoteQuestion[], nowIso: string): string {
  const open = questions.filter(inReview).sort((a, b) => lastWrongAt(b).localeCompare(lastWrongAt(a)));
  const s = reviewSummary(questions);
  const lines = [
    "# 오답노트",
    "",
    `> saa quiz가 자동으로 만드는 파일입니다. 직접 고쳐도 다음 풀이 때 다시 만들어집니다. 갱신: ${nowIso}`,
    "",
    `남은 오답 ${s.total}문제 (${KIND_LABEL.confident} ${s.confident} / ${KIND_LABEL.unsure} ${s.unsure}), 졸업 ${s.graduated}문제.`,
    "",
  ];
  const services = tagStats(questions).services.filter((t) => t.inReview > 0);
  if (services.length) {
    services.sort((a, b) => b.inReview - a.inReview || rate(a) - rate(b) || a.name.localeCompare(b.name));
    lines.push("## 서비스별", "", "| 서비스 | 남은 오답 | 정답률 |", "|---|---|---|");
    for (const t of services) lines.push(`| ${t.name} | ${t.inReview} | ${rate(t)}% (${t.correct}/${t.attempted}) |`);
    lines.push("");
  }
  for (const kind of ["confident", "unsure"] as const) {
    const group = open.filter((q) => reviewKind(q) === kind);
    if (!group.length) continue;
    lines.push(`## ${KIND_LABEL[kind]} (${group.length})`, "", ...group.map(renderEntry));
  }
  return lines.join("\n");
}
