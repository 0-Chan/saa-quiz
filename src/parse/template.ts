export const TEMPLATE = `## 문제

## 선택지
A.
B.
C.
D.

## 정답
(예: B 또는 B, D)

## 해설 (선택)
`;

export interface ParsedQuestion {
  stem: string;
  choices: Record<string, string>;
  answer: string[];
  explanation: string;
}

export type ParseResult =
  | { kind: "ok"; value: ParsedQuestion }
  | { kind: "invalid"; errors: string[] }
  | { kind: "cancel" };

type Section = "stem" | "choices" | "answer" | "explanation";

const HEADERS: [RegExp, Section][] = [
  [/^##\s*문제\s*$/, "stem"],
  [/^##\s*선택지\s*$/, "choices"],
  [/^##\s*정답\s*$/, "answer"],
  [/^##\s*해설(\s*\(선택\))?\s*$/, "explanation"],
];
const CHOICE_LINE = /^([A-Za-z])[.)]\s*(.*)$/;
// Template guidance such as "(예: B 또는 B, D)" is not user input.
const HINT_LINE = /^\(.*\)$/;

function splitSections(text: string): Record<Section, string[]> {
  const sections: Record<Section, string[]> = { stem: [], choices: [], answer: [], explanation: [] };
  let current: Section | null = null;
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    const header = HEADERS.find(([re]) => re.test(line));
    if (header) {
      current = header[1];
      continue;
    }
    if (current && !HINT_LINE.test(line)) sections[current].push(raw);
  }
  return sections;
}

function joinBlock(lines: string[]): string {
  return lines.join("\n").trim();
}

/** Parse the add-editor template. Pure: no fs or terminal access. */
export function parseTemplate(text: string): ParseResult {
  const sections = splitSections(text);
  const stem = joinBlock(sections.stem);
  const explanation = joinBlock(sections.explanation);

  const choiceEntries: [string, string][] = [];
  const errors: string[] = [];
  let lastLabel: string | null = null;
  for (const raw of sections.choices) {
    const line = raw.trim();
    if (!line) continue;
    const m = CHOICE_LINE.exec(line);
    if (m) {
      const label = m[1]!.toUpperCase();
      const body = m[2]!.trim();
      if (!body) {
        lastLabel = null; // empty template slot such as "C. "
        continue;
      }
      choiceEntries.push([label, body]);
      lastLabel = label;
    } else if (lastLabel) {
      // Continuation of a multi-line choice.
      const last = choiceEntries[choiceEntries.length - 1]!;
      last[1] = `${last[1]} ${line}`;
    } else {
      errors.push(`선택지 줄은 "A." 또는 "A)"로 시작해야 합니다: ${line}`);
    }
  }

  const answer = joinBlock(sections.answer)
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((label) => label.toUpperCase());

  if (!stem && choiceEntries.length === 0 && answer.length === 0 && !explanation && errors.length === 0) {
    return { kind: "cancel" };
  }

  if (!stem) errors.push("지문이 비어 있습니다.");
  if (choiceEntries.length < 2) errors.push("선택지가 2개 이상 필요합니다.");
  const labels = choiceEntries.map(([label]) => label);
  const duplicates = [...new Set(labels.filter((label, i) => labels.indexOf(label) !== i))];
  if (duplicates.length) errors.push(`선택지 라벨이 중복됩니다: ${duplicates.join(", ")}`);
  if (answer.length === 0) errors.push("정답을 입력하세요 (예: B 또는 B, D).");
  const unknown = answer.filter((label) => !labels.includes(label));
  if (unknown.length) errors.push(`정답 라벨이 선택지에 없습니다: ${unknown.join(", ")}`);
  if (new Set(answer).size !== answer.length) errors.push("정답 라벨이 중복됩니다.");

  if (errors.length) return { kind: "invalid", errors };
  return {
    kind: "ok",
    value: { stem, choices: Object.fromEntries(choiceEntries), answer: [...answer].sort(), explanation },
  };
}
