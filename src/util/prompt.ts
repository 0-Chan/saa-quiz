import { cancel, isCancel } from "@clack/prompts";

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
