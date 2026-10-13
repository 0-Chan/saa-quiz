#!/usr/bin/env node
import { Command } from "commander";
import { runAdd } from "./flows/add.js";
import { runQuiz } from "./flows/quiz.js";
import { runXp } from "./flows/xp.js";
import { APP_NAME, COMMAND, VERSION } from "./meta.js";
import { isUserExit } from "./util/prompt.js";

const program = new Command(COMMAND).description(`${APP_NAME}: AWS SAA 문제 풀이 CLI`).version(VERSION);

program.command("add").description("에디터로 문제를 등록합니다").action(runAdd);
program.command("quiz").description("등록한 문제를 풉니다").action(runQuiz);
program.command("xp").description("XP 현황을 봅니다").action(runXp);

try {
  await program.parseAsync();
} catch (error) {
  if (!isUserExit(error)) throw error;
  process.exitCode = 0;
}
