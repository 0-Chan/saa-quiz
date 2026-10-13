import { afterEach, describe, expect, it, vi } from "vitest";
import { localDay, toLocalIso } from "./time.js";

afterEach(() => vi.restoreAllMocks());

function fakeDate(fields: { y: number; mo: number; d: number; h: number; mi: number; s: number }, offsetMin: number) {
  const date = new Date(0);
  vi.spyOn(date, "getFullYear").mockReturnValue(fields.y);
  vi.spyOn(date, "getMonth").mockReturnValue(fields.mo - 1);
  vi.spyOn(date, "getDate").mockReturnValue(fields.d);
  vi.spyOn(date, "getHours").mockReturnValue(fields.h);
  vi.spyOn(date, "getMinutes").mockReturnValue(fields.mi);
  vi.spyOn(date, "getSeconds").mockReturnValue(fields.s);
  vi.spyOn(date, "getTimezoneOffset").mockReturnValue(-offsetMin);
  return date;
}

describe("toLocalIso", () => {
  it("formats a positive offset", () => {
    const d = fakeDate({ y: 2026, mo: 10, d: 8, h: 14, mi: 32, s: 5 }, 9 * 60);
    expect(toLocalIso(d)).toBe("2026-10-08T14:32:05+09:00");
  });

  it("formats a negative, non-hour offset", () => {
    const d = fakeDate({ y: 2026, mo: 1, d: 2, h: 3, mi: 4, s: 5 }, -(3 * 60 + 30));
    expect(toLocalIso(d)).toBe("2026-01-02T03:04:05-03:30");
  });

  it("round-trips to the same instant", () => {
    const now = new Date("2026-10-08T05:32:00Z");
    expect(new Date(toLocalIso(now)).getTime()).toBe(now.getTime());
  });
});

describe("localDay", () => {
  it("uses the recorded local date, not UTC", () => {
    expect(localDay("2026-10-09T00:30:00+09:00")).toBe("2026-10-09");
  });
});
