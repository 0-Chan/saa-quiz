import { createHash } from "node:crypto";

export function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export interface IdSource {
  stem: string;
  choices: Record<string, string>;
  answer: string[];
}

/** First 8 hex chars of sha256(normalized stem + choices in label order + sorted answer). */
export function questionId({ stem, choices, answer }: IdSource): string {
  const parts = [
    normalize(stem),
    ...Object.keys(choices).sort().map((label) => `${label}.${normalize(choices[label] ?? "")}`),
    `answer:${[...answer].sort().join(",")}`,
  ];
  return createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 8);
}
