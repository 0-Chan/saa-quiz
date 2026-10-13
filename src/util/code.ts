/** Access codes are compared case- and spacing-insensitively. Keep in sync with infra/seed-gate and scripts/set-code.sh. */
export function normalizeCode(code: string): string {
  return code.trim().toLowerCase().replace(/\s+/g, "-");
}
