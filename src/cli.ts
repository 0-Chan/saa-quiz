#!/usr/bin/env node
import { Command } from "commander";
import { runQuiz } from "./flows/quiz.js";
import { runXp } from "./flows/xp.js";
import { APP_NAME, COMMAND, VERSION } from "./meta.js";
import { isUserExit } from "./util/prompt.js";

const program = new Command(COMMAND).description(`${APP_NAME}: AWS SAA 문제 풀이 CLI`).version(VERSION);

program.command("quiz").description("문제를 풉니다 (처음 실행 시 기본 문제를 불러옵니다)").action(runQuiz);
program.command("xp").description("XP 현황을 봅니다").action(runXp);

try {
  await program.parseAsync();
} catch (error) {
  if (!isUserExit(error)) throw error;
  process.exitCode = 0;
}
