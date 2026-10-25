import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Install the actual package, then exercise it without credentials or real question data. */
export async function smokeInstall(spec, meta) {
  const temp = mkdtempSync(join(tmpdir(), "package-smoke-"));
  const env = { ...process.env, NO_UPDATE_NOTIFIER: "1", NO_COLOR: "1", SAA_LINE_INPUT: "1" };
  delete env.SAA_SEED_FILE;
  delete env.NODE_OPTIONS;
  try {
    execFileSync("npm", ["install", "--prefix", temp, "--no-save", "--package-lock=false", "--ignore-scripts", "--no-audit", "--no-fund", "--prefer-online", "--registry=https://registry.npmjs.org", spec], {
      env, stdio: "inherit", timeout: 180_000,
    });
    const installed = join(temp, "node_modules", meta.APP_NAME);
    const bin = join(temp, "node_modules", ".bin", meta.COMMAND);
    assert.ok(statSync(bin).mode & 0o111, "Installed command is not executable");
    const run = (command, input, data) => {
      const result = spawnSync(process.execPath, [bin, command], {
        env: { ...env, SAA_DATA_DIR: data }, input, encoding: "utf8", timeout: 10_000,
      });
      assert.equal(result.status, 0, command + ": " + (result.stderr || result.error || result.signal));
      assert.equal(result.stderr, "", command + " wrote to stderr");
      return result.stdout;
    };
    assert.equal(run("--version", "", join(temp, "version")).trim(), meta.VERSION);
    assert.match(run("--help", "", join(temp, "help")), /quiz/);
    assert.match(run("xp", "", join(temp, "xp")), /누적 XP/);
    assert.match(run("quiz", "", join(temp, "empty")), /종료합니다/);

    const { saveNew, loadAll } = await import(pathToFileURL(join(installed, "dist/store/questions.js")));
    const { questionId } = await import(pathToFileURL(join(installed, "dist/util/hash.js")));
    const cases = [
      { name: "single-back", answer: ["B"], input: "x\nb\n4\n\n1\n", selected: ["B"], confidence: 3, output: /정답입니다!/ },
      { name: "multi-back", answer: ["A", "C"], input: "aa\na\nac\n4\n\n2\n", selected: ["A", "C"], confidence: 2, output: /정답입니다!/ },
      { name: "wrong-view", answer: ["B"], input: "a\n1\n1\n", selected: ["A"], confidence: 3, output: /내 선택: A\./ },
      { name: "eof-answer", answer: ["B"], input: "", output: /종료합니다/ },
      { name: "eof-confidence", answer: ["B"], input: "b\n", output: /종료합니다/ },
      { name: "eof-after-save", answer: ["B"], input: "a\n1\n", selected: ["A"], confidence: 3, output: /종료합니다/ },
    ];
    for (const test of cases) {
      const data = join(temp, test.name);
      const fixture = { stem: "Release smoke fixture", choices: { A: "fixture A", B: "fixture B", C: "fixture C" }, answer: test.answer };
      await saveNew({ ...fixture, id: questionId(fixture), createdAt: "2026-01-01T00:00:00+00:00", services: [], attempts: [], explanation: "" }, { SAA_DATA_DIR: data });
      assert.match(run("quiz", test.input, data), test.output);
      const { questions, warnings } = await loadAll({ SAA_DATA_DIR: data });
      assert.deepEqual(warnings, []);
      assert.equal(questions[0].attempts.length, test.selected ? 1 : 0, test.name);
      if (test.selected) {
        assert.deepEqual(questions[0].attempts[0].answer, test.selected, test.name);
        assert.equal(questions[0].attempts[0].confidence, test.confidence, test.name);
        assert.ok(existsSync(join(data, "wrong-notes.md")), test.name);
      }
    }
    console.log("PASS installed package: 10 CLI scenarios on " + process.version);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
