import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataDir } from "../paths.js";
import { renderWrongNotes, type NoteQuestion } from "../review.js";

type Env = Record<string, string | undefined>;

export function wrongNotesPath(env: Env = process.env): string {
  return join(dataDir(env), "wrong-notes.md");
}

/** Regenerate wrong-notes.md from every question's attempts. */
export async function writeWrongNotes(questions: NoteQuestion[], nowIso: string, env: Env = process.env): Promise<void> {
  await mkdir(dataDir(env), { recursive: true });
  await writeFile(wrongNotesPath(env), renderWrongNotes(questions, nowIso));
}
