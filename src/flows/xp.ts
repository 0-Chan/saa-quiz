import { log } from "@clack/prompts";
import { existsSync } from "node:fs";
import { styleText } from "node:util";
import { dataDir } from "../paths.js";
import { KIND_LABEL, overallStat, PASS_RATE, passes, rate, reviewSummary, tagStats, weakServices, type TagStat } from "../review.js";
import { wrongNotesPath } from "../store/notes.js";
import { loadAll } from "../store/questions.js";
import { loadResets } from "../store/resets.js";
import { formatDuration, msOnDay, totalMs } from "../study.js";
import { displayWidth, padLabel } from "../util/text.js";
import { localDay, toLocalIso } from "../util/time.js";
import { cumulativeXp, xpOnDay } from "../xp.js";

type Row = [label: string, value: string];

export interface Section {
  title: string;
  rows: Row[];
}

/** Titled groups of label/value rows; labels line up across every section. Empty sections are dropped. */
export function renderSections(sections: Section[], title: (s: string) => string = (s) => s): string {
  const shown = sections.filter((s) => s.rows.length);
  const width = Math.max(0, ...shown.flatMap((s) => s.rows.map(([label]) => displayWidth(label)))) + 2;
  return shown
    .map((s) => [title(s.title), ...s.rows.map(([label, value]) => `  ${padLabel(label, width)}${value}`)].join("\n"))
    .join("\n\n");
}

/** "72% (61/85) · 합격선 72% 충족", or "-" before anything is attempted. */
export function accuracyLine(s: TagStat): string {
  if (!s.attempted) return "-";
  return `${rate(s)}% (${s.correct}/${s.attempted}) · 합격선 ${PASS_RATE}% ${passes(s) ? "충족" : "미달"}`;
}

const when = (show: unknown, row: Row): Row[] => (show ? [row] : []);

export async function runXp(): Promise<void> {
  const { questions, warnings } = await loadAll();
  const { state: resets, warning } = await loadResets();
  for (const w of warning ? [...warnings, warning] : warnings) log.warn(w);
  const today = localDay(toLocalIso(new Date()));
  const attempts = questions.reduce((sum, q) => sum + q.attempts.length, 0);
  const overall = overallStat(questions);
  const review = reviewSummary(questions);
  const stats = tagStats(questions);
  const weak = weakServices(stats.services);
  const pct = (t: TagStat) => `${t.name} ${rate(t)}%`;
  const share = questions.length ? ` (${Math.round((overall.attempted / questions.length) * 100)}%)` : "";
  const sections: Section[] = [
    {
      title: "XP",
      rows: [
        ["누적 XP", String(cumulativeXp(questions, resets.resets))],
        ["오늘 얻은 XP", String(xpOnDay(questions, today))],
        ...when(resets.resets.length, ["리셋", `${resets.resets.length}회`]),
      ],
    },
    {
      title: "진도",
      rows: [
        ["푼 문제", `${overall.attempted} / ${questions.length}${share}`],
        ["맞은 문제", String(overall.correct)],
        ["정답률", accuracyLine(overall)],
        ["총 시도", String(attempts)],
      ],
    },
    {
      title: "풀이 시간",
      rows: [
        ["오늘", formatDuration(msOnDay(questions, today))],
        ["누적", formatDuration(totalMs(questions))],
      ],
    },
    {
      title: "오답노트",
      rows: [
        ["남은 문제", `${review.total} (${KIND_LABEL.confident} ${review.confident} / ${KIND_LABEL.unsure} ${review.unsure})`],
        ["졸업", String(review.graduated)],
      ],
    },
    {
      title: "약점",
      rows: [
        ...when(weak.length, ["약한 서비스", weak.map((t) => `${pct(t)} (${t.correct}/${t.attempted})`).join(" · ")]),
        ...when(stats.domains.length, ["도메인별 정답률", stats.domains.map(pct).join(" · ")]),
      ],
    },
    {
      title: "파일",
      rows: [["데이터 폴더", dataDir()], ...when(existsSync(wrongNotesPath()), ["오답노트", wrongNotesPath()])],
    },
  ];
  console.log(renderSections(sections, (s) => styleText("bold", s)));
}
