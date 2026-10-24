import { createInterface } from "node:readline";
import { UserCancelled } from "../util/prompt.js";

/** One choice in a line-mode menu; `key` is what the user types (default: 1, 2, 3 …). */
export interface LineOption<T> {
  value: T;
  label: string;
  hint?: string;
  key?: string;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export const optionKeys = (options: { key?: string }[]) => options.map((o, i) => (o.key ?? String(i + 1)).toUpperCase());

const range = (keys: string[]) => (keys.length > 1 ? `${keys[0]}-${keys[keys.length - 1]}` : keys[0]!);

/** One key out of `keys` (case-insensitive) → its index. */
export function parseChoice(raw: string, keys: string[]): Parsed<number> {
  const i = keys.indexOf(raw.trim().toUpperCase());
  return i >= 0 ? { ok: true, value: i } : { ok: false, error: `${range(keys)} 중 하나를 입력하세요.` };
}

/** Exactly `n` distinct keys: "A,C", "a c" or "ac" → their indexes in key order. */
export function parseMulti(raw: string, keys: string[], n: number): Parsed<number[]> {
  const text = raw.trim().toUpperCase();
  const parts = /[\s,]/.test(text) ? text.split(/[\s,]+/).filter(Boolean) : keys.every((k) => k.length === 1) ? [...text] : [text];
  const indexes = parts.map((p) => keys.indexOf(p));
  if (indexes.some((i) => i < 0)) return { ok: false, error: `${range(keys)} 중에서 고르세요.` };
  const unique = [...new Set(indexes)];
  if (unique.length !== parts.length) return { ok: false, error: "같은 선택지를 두 번 골랐습니다." };
  if (unique.length !== n) return { ok: false, error: `정확히 ${n}개를 골라야 합니다 (${unique.length}개 입력함).` };
  return { ok: true, value: unique.sort((a, b) => a - b) };
}

/** y/n (also 예/아니오); empty → the default. */
export function parseYesNo(raw: string, fallback: boolean): Parsed<boolean> {
  const text = raw.trim().toLowerCase();
  if (!text) return { ok: true, value: fallback };
  if (["y", "yes", "예", "ㅇ"].includes(text)) return { ok: true, value: true };
  if (["n", "no", "아니오", "ㄴ"].includes(text)) return { ok: true, value: false };
  return { ok: false, error: "y 또는 n을 입력하세요." };
}

export interface LineInput {
  write(text: string): void;
  /** Next line after printing `question`; UserCancelled once input ends (EOF). */
  ask(question: string): Promise<string>;
  close(): void;
}

/** Line-by-line input that works without raw mode; one reader for the whole session. */
export function createLineInput(input: NodeJS.ReadableStream, output: NodeJS.WritableStream): LineInput {
  const rl = createInterface({ input, terminal: false });
  const lines: string[] = [];
  const waiting: { resolve: (line: string) => void; reject: (error: Error) => void }[] = [];
  let ended = false;
  rl.on("line", (line) => {
    const next = waiting.shift();
    if (next) next.resolve(line);
    else lines.push(line);
  });
  rl.on("close", () => {
    ended = true;
    for (const w of waiting.splice(0)) w.reject(new UserCancelled());
  });
  return {
    write: (text) => void output.write(text),
    ask(question) {
      output.write(question);
      if (lines.length) return Promise.resolve(lines.shift()!);
      if (ended) return Promise.reject(new UserCancelled());
      return new Promise((resolve, reject) => waiting.push({ resolve, reject }));
    },
    close: () => rl.close(),
  };
}

const menu = <T>(message: string, options: LineOption<T>[], keys: string[]) =>
  [message, ...options.map((o, i) => `  ${keys[i]}. ${o.key ? o.label.replace(new RegExp(`^${o.key}\\. `), "") : o.label}${o.hint ? ` — ${o.hint}` : ""}`), ""].join("\n");

/** Ask until `parse` accepts the line. */
async function askUntil<T>(io: LineInput, question: string, parse: (raw: string) => Parsed<T>): Promise<T> {
  for (;;) {
    const result = parse(await io.ask(question));
    if (result.ok) return result.value;
    io.write(`  ${result.error}\n`);
  }
}

export async function lineSelect<T>(io: LineInput, message: string, options: LineOption<T>[], initialValue?: T): Promise<T> {
  const keys = optionKeys(options);
  const initial = options.findIndex((o) => o.value === initialValue);
  io.write(menu(message, options, keys));
  const hint = initial >= 0 ? ` [${keys[initial]}]` : "";
  const i = await askUntil(io, `선택 (${range(keys)})${hint}: `, (raw) => (!raw.trim() && initial >= 0 ? { ok: true, value: initial } : parseChoice(raw, keys)));
  return options[i]!.value;
}

export async function lineMultiselect<T>(io: LineInput, message: string, options: LineOption<T>[], count: number, initialValues?: T[]): Promise<T[]> {
  const keys = optionKeys(options);
  const initial = options.flatMap((o, i) => (initialValues?.includes(o.value) ? [i] : []));
  io.write(menu(message, options, keys));
  const hint = initial.length ? ` [${initial.map((i) => keys[i]).join(",")}]` : "";
  const picked = await askUntil(io, `선택 (예: ${keys.slice(0, count).join(",")})${hint}: `, (raw) =>
    !raw.trim() && initial.length === count ? { ok: true, value: initial } : parseMulti(raw, keys, count),
  );
  return picked.map((i) => options[i]!.value);
}

export async function lineConfirm(io: LineInput, message: string, active: string, inactive: string, initialValue: boolean): Promise<boolean> {
  return askUntil(io, `${message} (${active} y / ${inactive} n) [${initialValue ? "y" : "n"}]: `, (raw) => parseYesNo(raw, initialValue));
}

export async function lineText(io: LineInput, message: string, validate?: (value: string) => string | undefined): Promise<string> {
  return askUntil(io, `${message}: `, (raw) => {
    const error = validate?.(raw);
    return error ? { ok: false, error } : { ok: true, value: raw };
  });
}
