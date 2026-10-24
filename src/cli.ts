#!/usr/bin/env node
import { Command } from "commander";
import updateNotifier from "update-notifier";
import { runQuiz } from "./flows/quiz.js";
import { runXp } from "./flows/xp.js";
import { APP_NAME, COMMAND, VERSION } from "./meta.js";
import { closePrompts, isUserExit } from "./util/prompt.js";

const program = new Command(COMMAND)
  .description(`${APP_NAME}: AWS SAA 문제 풀이 CLI`)
  .version(VERSION)
  // Read by update-notifier straight from argv; declared so commander accepts it.
  .option("--no-update-notifier", "새 버전 알림 끄기");

// Checks the registry in the background at most once a day; a found update shows when the next run exits.
program.hook("preAction", () => {
  updateNotifier({ pkg: { name: APP_NAME, version: VERSION } }).notify({
    message: `새 버전 {latestVersion}이 있습니다 (현재 {currentVersion}).\n업데이트: npm i -g ${APP_NAME}@latest`,
  });
});

program.command("quiz").description("문제를 풉니다 (처음 실행 시 기본 문제를 불러옵니다)").action(runQuiz);
program.command("xp").description("XP 현황을 봅니다").action(runXp);

try {
  await program.parseAsync();
} catch (error) {
  if (!isUserExit(error)) throw error;
  process.exitCode = 0;
} finally {
  closePrompts();
}
