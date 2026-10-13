// Default questions are not shipped in this repo. On first run with an empty question folder they are
// loaded from a bundle the user points to: SAA_SEED_FILE (local path) or SAA_SEED_URL (e.g. an S3 presigned URL).
import { readFile, readdir } from "node:fs/promises";
import { z } from "zod";
import { questionsDir } from "./paths.js";
import { saveNew, type Question } from "./store/questions.js";
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
    }),
  ),
});

export type Bundle = z.infer<typeof bundleSchema>;
export type SourceQuestion = Bundle["questions"][number];
export type SolvedAnswer = Bundle["answers"][number];

/** Low-confidence answers are left out; the explanation is the Korean rationale only. */
export function buildBundled(sources: SourceQuestion[], answers: SolvedAnswer[], createdAt: string): Question[] {
  const byId = new Map(sources.map((q) => [q.id, q]));
  return answers
    .filter((a) => a.confidence !== "low")
    .map((solved) => {
      const source = byId.get(solved.id);
      if (!source) throw new Error(`Q${solved.id}: 번들 questions에 없음`);
      const content = { stem: source.stem, choices: source.options, answer: [...solved.answer].sort() };
      return { ...content, id: questionId(content), createdAt, attempts: [], explanation: solved.rationale_ko };
    });
}

export type SeedResult =
  | { status: "seeded"; count: number }
  | { status: "skipped" } // folder already has questions
  | { status: "none" } // no source configured
  | { status: "failed"; reason: string };

async function readBundle(env: Env, fetchFn: typeof fetch): Promise<unknown> {
  if (env.SAA_SEED_FILE) return JSON.parse(await readFile(env.SAA_SEED_FILE, "utf8"));
  const res = await fetchFn(env.SAA_SEED_URL!);
  if (!res.ok) throw new Error(`HTTP ${res.status}${res.status === 403 ? " (URL이 만료됐거나 잘못됨)" : ""}`);
  return res.json();
}

/** If the question folder has no question files and a source is configured, save the bundle's questions. */
export async function seedIfEmpty(createdAt: string, env: Env = process.env, fetchFn: typeof fetch = fetch): Promise<SeedResult> {
  const existing = await readdir(questionsDir(env)).catch(() => [] as string[]);
  if (existing.some((name) => name.endsWith(".md"))) return { status: "skipped" };
  if (!env.SAA_SEED_FILE && !env.SAA_SEED_URL) return { status: "none" };
  let questions: Question[];
  try {
    const bundle = bundleSchema.parse(await readBundle(env, fetchFn));
    questions = buildBundled(bundle.questions, bundle.answers, createdAt);
  } catch (error) {
    const reason = error instanceof z.ZodError ? "번들 형식 오류" : error instanceof Error ? error.message.split("\n")[0]! : String(error);
    return { status: "failed", reason };
  }
  let count = 0;
  for (const q of questions) if ((await saveNew(q, env)) === "saved") count += 1;
  return { status: "seeded", count };
}
