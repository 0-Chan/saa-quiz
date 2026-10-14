// Default questions are not shipped in this repo. On the first `saa quiz` with an empty question folder they are
// fetched from the access-code gate (infra/seed-gate), or read from SAA_SEED_FILE when set (offline use, tests).
import { readFile, readdir } from "node:fs/promises";
import { z } from "zod";
import { SEED_GATE_URL } from "./meta.js";
import { questionsDir } from "./paths.js";
import { DOMAINS } from "./review.js";
import { saveNew, type Question } from "./store/questions.js";
import { normalizeCode } from "./util/code.js";
import { questionId } from "./util/hash.js";

type Env = Record<string, string | undefined>;

const label = z.string().regex(/^[A-Z]$/);
// Low-confidence entries may have blank choices; they are skipped by buildBundled.
const bundleSchema = z.object({
  questions: z.array(z.object({ id: z.number().int(), stem: z.string().min(1), options: z.record(label, z.string()) })),
  answers: z.array(
    z.object({
      id: z.number().int(),
      answer: z.array(label).min(1),
      confidence: z.enum(["high", "medium", "low"]),
      rationale_ko: z.string(),
      services: z.array(z.string().min(1)).default([]),
      domain: z.enum(DOMAINS).optional(),
    }),
  ),
});

// The shape as written in the bundle file; tags are optional so bundles from before tags still load.
export type Bundle = z.input<typeof bundleSchema>;
export type SourceQuestion = Bundle["questions"][number];
export type SolvedAnswer = Bundle["answers"][number];

/** Low-confidence answers are left out; the explanation is the Korean rationale only. Tags pass through when present. */
export function buildBundled(sources: SourceQuestion[], answers: SolvedAnswer[], createdAt: string): Question[] {
  const byId = new Map(sources.map((q) => [q.id, q]));
  return answers
    .filter((a) => a.confidence !== "low")
    .map((solved) => {
      const source = byId.get(solved.id);
      if (!source) throw new Error(`Q${solved.id}: 번들 questions에 없음`);
      const content = { stem: source.stem, choices: source.options, answer: [...solved.answer].sort() };
      return {
        ...content,
        id: questionId(content),
        createdAt,
        services: solved.services ?? [],
        ...(solved.domain ? { domain: solved.domain } : {}),
        attempts: [],
        explanation: solved.rationale_ko,
      };
    });
}

export type BundleResult = { ok: true; bundle: Bundle } | { ok: false; reason: string; wrongCode: boolean };

const describe = (error: unknown) =>
  error instanceof z.ZodError ? "번들 형식 오류" : error instanceof Error ? error.message.split("\n")[0]! : String(error);

export async function readBundleFile(path: string): Promise<BundleResult> {
  try {
    return { ok: true, bundle: bundleSchema.parse(JSON.parse(await readFile(path, "utf8"))) };
  } catch (error) {
    return { ok: false, reason: describe(error), wrongCode: false };
  }
}

/** Ask the gate for the bundle with an access code. 403 means a wrong code. */
export async function fetchBundleWithCode(code: string, fetchFn: typeof fetch = fetch, url = SEED_GATE_URL): Promise<BundleResult> {
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: normalizeCode(code) }),
    });
    if (res.status === 403) return { ok: false, reason: "코드가 틀렸습니다", wrongCode: true };
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}`, wrongCode: false };
    return { ok: true, bundle: bundleSchema.parse(await res.json()) };
  } catch (error) {
    return { ok: false, reason: describe(error), wrongCode: false };
  }
}

export async function hasQuestions(env: Env = process.env): Promise<boolean> {
  const names = await readdir(questionsDir(env)).catch(() => [] as string[]);
  return names.some((name) => name.endsWith(".md"));
}

/** Save the bundle's questions (existing files are kept). Returns how many were newly saved. */
export async function saveBundle(bundle: Bundle, createdAt: string, env: Env = process.env): Promise<number> {
  let count = 0;
  for (const q of buildBundled(bundle.questions, bundle.answers, createdAt)) if ((await saveNew(q, env)) === "saved") count += 1;
  return count;
}
