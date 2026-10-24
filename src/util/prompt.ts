import { cancel, confirm as clackConfirm, isCancel, log, multiselect as clackMultiselect, select as clackSelect, text as clackText } from "@clack/prompts";
import { createLineInput, lineConfirm, lineMultiselect, lineSelect, lineText, type LineInput, type LineOption } from "../ui/line-input.js";

/** Thrown to unwind out of a flow when the user presses Ctrl+C; cli.ts exits quietly on it. */
export class UserCancelled extends Error {
  constructor() {
    super("cancelled");
    this.name = "UserCancelled";
  }
}

/** Unwrap a clack prompt result, turning Ctrl+C (cancel symbol) into UserCancelled. */
export function unwrap<T>(value: T): Exclude<T, symbol> {
  if (isCancel(value)) {
    cancel("종료합니다.");
    throw new UserCancelled();
  }
  return value as Exclude<T, symbol>;
}

export function isUserExit(error: unknown): boolean {
  return error instanceof UserCancelled;
}

export type InputMode = "interactive" | "line";

/**
 * Arrow-key prompts need a TTY with raw mode; without it (iOS a-Shell, piped input) fall back to
 * typing a key and Enter. Decided by capability, not platform. SAA_LINE_INPUT=1 forces line mode.
 */
export function inputMode(
  stdin: { isTTY?: boolean; setRawMode?: unknown } = process.stdin,
  env: Record<string, string | undefined> = process.env,
): InputMode {
  if (env.SAA_LINE_INPUT === "1") return "line";
  return stdin.isTTY === true && typeof stdin.setRawMode === "function" ? "interactive" : "line";
}

let lineIo: LineInput | null = null;
const line = () => (lineIo ??= createLineInput(process.stdin, process.stdout));
const interactive = () => inputMode() === "interactive";

/** Line mode ends with "종료합니다." like a clack cancel. */
async function guard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof UserCancelled) cancel("종료합니다.");
    throw error;
  }
}

/** Prompts used by the flows: clack UI on a TTY, line input otherwise. Ctrl+C / EOF throw UserCancelled. */
export const prompt = {
  async text(opts: { message: string; placeholder?: string; validate?: (value: string) => string | undefined }): Promise<string> {
    if (interactive()) return unwrap(await clackText({ ...opts, validate: (v) => opts.validate?.(v ?? "") }));
    return guard(() => lineText(line(), opts.message, opts.validate));
  },

  async select<T>(opts: { message: string; options: LineOption<T>[]; initialValue?: T }): Promise<T> {
    if (interactive()) return unwrap(await clackSelect<T>(opts as Parameters<typeof clackSelect<T>>[0]));
    return guard(() => lineSelect(line(), opts.message, opts.options, opts.initialValue));
  },

  /** Exactly `count` options. */
  async multiselect<T>(opts: { message: string; options: LineOption<T>[]; count: number; initialValues?: T[] }): Promise<T[]> {
    if (!interactive()) return guard(() => lineMultiselect(line(), opts.message, opts.options, opts.count, opts.initialValues));
    for (;;) {
      const picked = unwrap(
        await clackMultiselect<T>({
          message: `${opts.message} (Space로 선택, Enter로 제출)`,
          options: opts.options,
          required: true,
          initialValues: opts.initialValues,
        } as Parameters<typeof clackMultiselect<T>>[0]),
      );
      if (picked.length === opts.count) return picked;
      log.warn(`정확히 ${opts.count}개를 골라야 합니다 (${picked.length}개 선택함).`);
    }
  },

  async confirm(opts: { message: string; active: string; inactive: string; initialValue: boolean }): Promise<boolean> {
    if (interactive()) return unwrap(await clackConfirm(opts));
    return guard(() => lineConfirm(line(), opts.message, opts.active, opts.inactive, opts.initialValue));
  },
};

/** Release stdin so the process can exit after a line-mode session. */
export function closePrompts(): void {
  lineIo?.close();
  lineIo = null;
}
