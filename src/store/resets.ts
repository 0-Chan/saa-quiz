import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import { dataDir } from "../paths.js";
import { isoTime } from "./questions.js";

type Env = Record<string, string | undefined>;

const FILE = "xp-resets.md";

const resetsSchema = z.object({
  asked: z.array(z.number().int()).default([]),
  resets: z.array(z.object({ at: isoTime, adjust: z.number().int() })).default([]),
});

export type ResetState = z.infer<typeof resetsSchema>;

export interface ResetLoad {
  state: ResetState;
  warning: string | null;
}

const empty = (): ResetState => ({ asked: [], resets: [] });

/** Missing file → empty state; malformed file → empty state plus a one-line warning. */
export async function loadResets(env: Env = process.env): Promise<ResetLoad> {
  let text: string;
  try {
    text = await readFile(join(dataDir(env), FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: empty(), warning: null };
    throw error;
  }
  try {
    return { state: resetsSchema.parse(matter(text, {}).data), warning: null };
  } catch {
    return { state: empty(), warning: `무시함: ${FILE} 형식 오류` };
  }
}

export async function saveResets(state: ResetState, env: Env = process.env): Promise<void> {
  const dir = dataDir(env);
  await mkdir(dir, { recursive: true });
  const body = "음수 마일스톤에서 받은 XP 리셋 기록. asked는 이미 물어본 점수, resets[].adjust는 리셋 때 더한 XP다.\n";
  await writeFile(join(dir, FILE), matter.stringify(body, { asked: state.asked, resets: state.resets }));
}
