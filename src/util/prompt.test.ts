import { describe, expect, it } from "vitest";
import { inputMode } from "./prompt.js";

describe("inputMode", () => {
  const rawMode = () => {};

  it("uses the arrow-key UI only on a TTY with raw mode", () => {
    expect(inputMode({ isTTY: true, setRawMode: rawMode }, {})).toBe("interactive");
  });

  it("falls back to line input without a TTY or raw mode (iOS a-Shell, pipes)", () => {
    expect(inputMode({ isTTY: undefined }, {})).toBe("line");
    expect(inputMode({ isTTY: true }, {})).toBe("line");
    expect(inputMode({ isTTY: false, setRawMode: rawMode }, {})).toBe("line");
  });

  it("SAA_LINE_INPUT=1 forces line input", () => {
    expect(inputMode({ isTTY: true, setRawMode: rawMode }, { SAA_LINE_INPUT: "1" })).toBe("line");
  });
});
