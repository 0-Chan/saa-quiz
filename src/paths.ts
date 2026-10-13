import { homedir } from "node:os";
import { join } from "node:path";
import { APP_NAME } from "./meta.js";

type Env = Record<string, string | undefined>;

export function dataDir(env: Env = process.env): string {
  return env.SAA_DATA_DIR?.trim() || join(homedir(), APP_NAME);
}

export function questionsDir(env: Env = process.env): string {
  return join(dataDir(env), "questions");
}
