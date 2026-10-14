import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import { questionsDir } from "../paths.js";
import { DOMAINS, type Domain } from "../review.js";
import { toLocalIso } from "../util/time.js";

type Env = Record<string, string | undefined>;

// YAML reads unquoted ISO timestamps as Date; accept both and keep a local ISO string.
export const isoTime = z.union([z.string().min(1), z.date()]).transform((v) => (v instanceof Date ? toLocalIso(v) : v));
const label = z.string().regex(/^[A-Z]$/);

const attemptSchema = z.object({
  at: isoTime,
  answer: z.array(label),
  correct: z.boolean(),
  confidence: z.number().int().min(1).max(3),
  ms: z.number().int().nonnegative(),
});

const frontmatterSchema = z
  .object({
    id: z.string().regex(/^[0-9a-f]{8}$/),
    createdAt: isoTime,
    choices: z.record(label, z.string().min(1)),
    answer: z.array(label).min(1),
    services: z.array(z.string().min(1)).default([]),
    domain: z.enum(DOMAINS).optional(),
    attempts: z.array(attemptSchema).default([]),
  })
  .refine((q) => Object.keys(q.choices).length >= 2, { message: "선택지가 2개 이상 필요합니다" })
  .refine((q) => q.answer.every((a) => a in q.choices), { message: "정답 라벨이 선택지에 없습니다" });

export type Attempt = z.infer<typeof attemptSchema>;

export interface Question {
  id: string;
  createdAt: string;
  choices: Record<string, string>;
  answer: string[];
  /** AWS services the question is about (from the bundle; empty for questions seeded before tags existed). */
  services: string[];
  domain?: Domain;
  attempts: Attempt[];
  stem: string;
  explanation: string;
}

export interface LoadResult {
  questions: Question[];
  warnings: string[];
}

const EXPLANATION_HEADER = /^##\s*해설.*$/m;

function parseBody(content: string): { stem: string; explanation: string } {
  const body = content.replace(/^\s*##\s*문제\s*$/m, "");
  const match = EXPLANATION_HEADER.exec(body);
  if (!match) return { stem: body.trim(), explanation: "" };
  return { stem: body.slice(0, match.index).trim(), explanation: body.slice(match.index + match[0].length).trim() };
}

function renderBody(q: Pick<Question, "stem" | "explanation">): string {
  return `## 문제\n${q.stem}\n\n## 해설\n${q.explanation}\n`;
}

function serialize(q: Question): string {
  const data = {
    id: q.id,
    createdAt: q.createdAt,
    choices: q.choices,
    answer: q.answer,
    ...(q.services.length ? { services: q.services } : {}),
    ...(q.domain ? { domain: q.domain } : {}),
    attempts: q.attempts,
  };
  return matter.stringify(renderBody(q), data);
}

export function parseQuestionFile(text: string): Question {
  // Passing options disables gray-matter's content cache, which would share mutable data objects.
  const file = matter(text, {});
  const data = frontmatterSchema.parse(file.data);
  return { ...data, ...parseBody(file.content) };
}

function describeError(error: unknown): string {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    return issue ? `${issue.path.join(".") || "frontmatter"}: ${issue.message}` : "형식 오류";
  }
  return error instanceof Error ? error.message.split("\n")[0]! : String(error);
}

async function ensureDir(env: Env): Promise<string> {
  const dir = questionsDir(env);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Load every question file; malformed files become one-line warnings and are skipped. */
export async function loadAll(env: Env = process.env): Promise<LoadResult> {
  const dir = await ensureDir(env);
  const names = (await readdir(dir)).filter((name) => name.endsWith(".md")).sort();
  const questions: Question[] = [];
  const warnings: string[] = [];
  for (const name of names) {
    try {
      const q = parseQuestionFile(await readFile(join(dir, name), "utf8"));
      if (`${q.id}.md` !== name) throw new Error(`파일 이름과 id(${q.id})가 다릅니다`);
      questions.push(q);
    } catch (error) {
      warnings.push(`건너뜀: questions/${name} (${describeError(error)})`);
    }
  }
  return { questions, warnings };
}

/** Write a new question file. Returns "exists" instead of overwriting. */
export async function saveNew(q: Question, env: Env = process.env): Promise<"saved" | "exists"> {
  const dir = await ensureDir(env);
  try {
    await writeFile(join(dir, `${q.id}.md`), serialize(q), { flag: "wx" });
    return "saved";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return "exists";
    throw error;
  }
}

/** Re-read the file (it may have been hand-edited), append one attempt, and write it back. */
export async function appendAttempt(id: string, attempt: Attempt, env: Env = process.env): Promise<Question> {
  const path = join(await ensureDir(env), `${id}.md`);
  const q = parseQuestionFile(await readFile(path, "utf8"));
  const updated = { ...q, attempts: [...q.attempts, attempt] };
  await writeFile(path, serialize(updated));
  return updated;
}
