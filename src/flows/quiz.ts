import { confirm, intro, log, multiselect, outro, select, spinner, text } from "@clack/prompts";
import { COMMAND } from "../meta.js";
import { appendAttempt, loadAll, type Question } from "../store/questions.js";
import { fetchBundleWithCode, hasQuestions, readBundleFile, saveBundle, type BundleResult } from "../seed.js";
import { loadResets, saveResets, type ResetState } from "../store/resets.js";
import { playConfetti } from "../ui/confetti.js";
import { unwrap } from "../util/prompt.js";
import { toLocalIso } from "../util/time.js";
import { CBM, crossedMilestone, crossedNegativeMilestones, cumulativeXp, earnsXp, isCorrect, points, type Confidence } from "../xp.js";

const lastAttempt = (q: Question) => q.attempts[q.attempts.length - 1];

function pickRandom<T>(items: T[], random: () => number): T | null {
  return items.length ? items[Math.floor(random() * items.length)]! : null;
}

/**
 * Next question for this session: never attempted → last attempt wrong → oldest last attempt.
 * Random within a group (for the last group, among those tied for the oldest attempt).
 */
export function pickNext(questions: Question[], seen: ReadonlySet<string>, random: () => number = Math.random): Question | null {
  const pool = questions.filter((q) => !seen.has(q.id));
  const unattempted = pool.filter((q) => q.attempts.length === 0);
  if (unattempted.length) return pickRandom(unattempted, random);
  const lastWrong = pool.filter((q) => lastAttempt(q)?.correct === false);
  if (lastWrong.length) return pickRandom(lastWrong, random);
  if (!pool.length) return null;
  const time = (q: Question) => new Date(lastAttempt(q)!.at).getTime();
  const oldest = Math.min(...pool.map(time));
  return pickRandom(pool.filter((q) => time(q) === oldest), random);
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

async function askAnswer(q: Question): Promise<string[]> {
  const options = Object.entries(q.choices).map(([label, text]) => ({ value: label, label: `${label}. ${text}` }));
  const n = q.answer.length;
  if (n === 1) return [unwrap(await select({ message: "답을 고르세요", options }))];
  for (;;) {
    const picked = unwrap(await multiselect({ message: `${n}개를 고르세요 (Space로 선택, Enter로 제출)`, options, required: true }));
    if (picked.length === n) return picked.sort();
    log.warn(`정확히 ${n}개를 골라야 합니다 (${picked.length}개 선택함).`);
  }
}

async function askConfidence(): Promise<Confidence> {
  const levels: Confidence[] = [3, 2, 1];
  return unwrap(
    await select({
      message: "확신도는?",
      options: levels.map((c) => ({
        value: c,
        label: CBM[c].label,
        hint: `맞으면 ${signed(CBM[c].correct)} / 틀리면 ${signed(CBM[c].wrong)}`,
      })),
    }),
  );
}

/** First time total XP falls through a negative milestone, offer to reset it to 0. Saves only after an answer. */
async function offerReset(resets: ResetState, before: number, after: number, at: string): Promise<void> {
  const crossed = crossedNegativeMilestones(before, after);
  const fresh = crossed.filter((m) => !resets.asked.includes(m));
  if (!fresh.length) return;
  const reset = unwrap(
    await confirm({
      message: `누적 XP가 ${signed(Math.min(...fresh))}에 도달했습니다. 0점으로 리셋할까요?`,
      active: "리셋",
      inactive: "유지",
      initialValue: false,
    }),
  );
  resets.asked = [...new Set([...resets.asked, ...crossed])].sort((a, b) => b - a);
  if (reset) resets.resets = [...resets.resets, { at, adjust: -after }];
  await saveResets(resets);
  if (reset) log.success("누적 XP를 0으로 리셋했습니다.");
}

const CODE_TRIES = 3;

/** First run: get the default questions with an access code (or from SAA_SEED_FILE). */
async function seedDefaultQuestions(): Promise<void> {
  const file = process.env.SAA_SEED_FILE;
  let result: BundleResult | null = file ? await readBundleFile(file) : null;
  if (!result) {
    log.info("처음 실행입니다. 기본 문제를 받으려면 접근 코드를 입력하세요.");
    for (let i = 1; i <= CODE_TRIES; i++) {
      const code = unwrap(
        await text({
          message: "접근 코드",
          placeholder: "xxx-xxx",
          validate: (v) => (v?.trim() ? undefined : "코드를 입력하세요"),
        }),
      );
      const s = spinner();
      s.start("기본 문제를 받는 중");
      result = await fetchBundleWithCode(code);
      s.stop(result.ok ? "받았습니다" : "받지 못했습니다");
      if (result.ok || !result.wrongCode) break;
      if (i < CODE_TRIES) log.warn(`${result.reason} (${i}/${CODE_TRIES})`);
    }
  }
  if (!result!.ok) {
    log.warn(`기본 문제를 받지 못했습니다: ${result!.reason}`);
    return;
  }
  const count = await saveBundle(result!.bundle, toLocalIso(new Date()));
  log.success(`기본 문제 ${count}개를 불러왔습니다.`);
}

export async function runQuiz(): Promise<void> {
  intro(`${COMMAND} quiz`);
  if (!(await hasQuestions())) await seedDefaultQuestions();
  const { questions, warnings } = await loadAll();
  const { state: resets, warning } = await loadResets();
  for (const w of warning ? [...warnings, warning] : warnings) log.warn(w);
  const total = () => cumulativeXp(questions, resets.resets);
  if (!questions.length) {
    outro(`문제가 없습니다. 접근 코드를 확인한 뒤 \`${COMMAND} quiz\`를 다시 실행하세요.`);
    return;
  }

  log.info(`누적 XP: ${signed(total())}`);

  const seen = new Set<string>();
  const session = { solved: 0, correct: 0, xp: 0 };

  for (let q = pickNext(questions, seen); q; q = pickNext(questions, seen)) {
    seen.add(q.id);
    log.message(`[${q.id}] ${q.stem}`);

    const shownAt = Date.now();
    const selected = await askAnswer(q);
    const ms = Date.now() - shownAt;
    const confidence = await askConfidence();

    const at = toLocalIso(new Date());
    const correct = isCorrect(selected, q.answer);
    const firstToday = earnsXp(q, at);
    const xp = firstToday ? points(confidence, correct) : 0;

    const before = total();
    const updated = await appendAttempt(q.id, { at, answer: selected, correct, confidence, ms });
    questions[questions.indexOf(q)] = updated;
    session.solved += 1;
    session.correct += correct ? 1 : 0;
    session.xp += xp;

    if (correct) log.success("정답입니다!");
    else log.error(`오답입니다. (선택: ${[...selected].sort().join(", ")} / 정답: ${[...q.answer].sort().join(", ")})`);
    const after = total();
    const reached = crossedMilestone(before, after);
    if (reached !== null) {
      await playConfetti();
      log.success(`🎉 누적 XP ${reached} 달성!`);
    }
    log.info(
      [
        firstToday ? `이번 XP: ${signed(xp)}` : "오늘 이미 시도한 문제라 XP 없음",
        `누적 XP: ${signed(total())}`,
        `정답: ${q.answer.map((label) => `${label}. ${q.choices[label]}`).join(" / ")}`,
        ...(q.explanation ? [`해설: ${q.explanation}`] : []),
      ].join("\n"),
    );
    await offerReset(resets, before, after, at);

    if (!pickNext(questions, seen)) break;
    const next = unwrap(
      await select({
        message: "계속할까요?",
        options: [
          { value: "next", label: "다음 문제" },
          { value: "quit", label: "종료" },
        ],
      }),
    );
    if (next === "quit") break;
  }

  outro(
    `세션 요약 — 푼 문제 ${session.solved}개, 정답 ${session.correct}개, ` +
      `세션 XP ${signed(session.xp)}, 누적 XP ${signed(total())}`,
  );
}
