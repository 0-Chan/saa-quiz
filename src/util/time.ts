const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, "0");

/** Local-timezone ISO string with offset, e.g. 2026-10-08T14:32:00+09:00. */
export function toLocalIso(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(offset / 60)}:${pad(offset % 60)}`
  );
}

/** Local calendar day (YYYY-MM-DD) as recorded in a local ISO string. */
export function localDay(iso: string): string {
  return iso.slice(0, 10);
}
