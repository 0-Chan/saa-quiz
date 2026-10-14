import { log } from "@clack/prompts";
import { dataDir } from "../paths.js";
import { loadAll } from "../store/questions.js";
import { loadResets } from "../store/resets.js";
import { formatDuration, msOnDay, totalMs } from "../study.js";
import { localDay, toLocalIso } from "../util/time.js";
import { cumulativeXp, xpOnDay } from "../xp.js";

export async function runXp(): Promise<void> {
  const { questions, warnings } = await loadAll();
  const { state: resets, warning } = await loadResets();
  for (const w of warning ? [...warnings, warning] : warnings) log.warn(w);
  const today = localDay(toLocalIso(new Date()));
  const attempts = questions.reduce((sum, q) => sum + q.attempts.length, 0);
  console.log(
    [
      `누적 XP         ${cumulativeXp(questions, resets.resets)}`,
      ...(resets.resets.length ? [`리셋            ${resets.resets.length}회`] : []),
      `오늘 얻은 XP    ${xpOnDay(questions, today)}`,
      `오늘 풀이 시간  ${formatDuration(msOnDay(questions, today))}`,
      `누적 풀이 시간  ${formatDuration(totalMs(questions))}`,
      `등록된 문제     ${questions.length}`,
      `총 시도         ${attempts}`,
      `데이터 폴더     ${dataDir()}`,
    ].join("\n"),
  );
}
