import editor from "@inquirer/editor";
import { intro, log, outro, select } from "@clack/prompts";
import { COMMAND } from "../meta.js";
import { TEMPLATE, parseTemplate, type ParsedQuestion } from "../parse/template.js";
import { saveNew } from "../store/questions.js";
import { questionId } from "../util/hash.js";
import { unwrap } from "../util/prompt.js";
import { toLocalIso } from "../util/time.js";

/** Open the editor until the input parses, or return null when the user leaves it empty. */
async function editUntilValid(): Promise<ParsedQuestion | null> {
  let text = TEMPLATE;
  for (;;) {
    text = await editor({ message: "에디터에서 문제를 작성하고 저장한 뒤 닫으세요.", default: text, postfix: ".md", waitForUserInput: false });
    const result = parseTemplate(text);
    if (result.kind === "ok") return result.value;
    if (result.kind === "cancel") return null;
    log.error(["입력을 확인하세요. 같은 내용으로 에디터를 다시 엽니다.", ...result.errors.map((e) => `- ${e}`)].join("\n"));
  }
}

export async function runAdd(): Promise<void> {
  intro(`${COMMAND} add`);
  for (;;) {
    const parsed = await editUntilValid();
    if (!parsed) {
      outro("입력이 비어 있어 등록을 취소했습니다.");
      return;
    }
    const { stem, choices, answer, explanation } = parsed;
    const id = questionId({ stem, choices, answer });
    const saved = await saveNew({ id, createdAt: toLocalIso(new Date()), choices, answer, attempts: [], stem, explanation });
    if (saved === "exists") log.warn(`이미 등록된 문제입니다 (id ${id}). 저장하지 않았습니다.`);
    else log.success(`등록했습니다: questions/${id}.md (정답 ${answer.join(", ")})`);

    const next = unwrap(
      await select({
        message: "다음 작업",
        options: [
          { value: "again", label: "하나 더 등록" },
          { value: "quit", label: "종료" },
        ],
      }),
    );
    if (next === "quit") break;
  }
  outro("등록을 마쳤습니다.");
}
