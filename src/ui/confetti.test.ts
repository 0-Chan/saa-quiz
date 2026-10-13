import { describe, expect, it } from "vitest";
import { playConfetti, renderFrame, spawn, step, type Particle } from "./confetti.js";

const p = (x: number, y: number, char = "*"): Particle => ({ x, y, vx: 0, vy: 1, char, color: 31 });
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

describe("renderFrame", () => {
  it("returns exactly height lines, none wider than width", () => {
    const parts = spawn(50, 20, 6, () => 0.5).concat([p(19, 5), p(0, 0)]);
    const lines = renderFrame(parts, 20, 6, true);
    expect(lines).toHaveLength(6);
    for (const line of lines) expect([...strip(line)].length).toBeLessThanOrEqual(20);
  });

  it("places particles at rounded positions", () => {
    expect(renderFrame([p(1.4, 0.6, "•")], 4, 2, false)).toEqual(["", " •"]);
  });

  it("does not draw particles outside the region", () => {
    expect(renderFrame([p(1, -1), p(1, 3), p(-1, 0), p(4, 0)], 4, 3, false)).toEqual(["", "", ""]);
  });

  it("colors particles only when asked", () => {
    expect(renderFrame([p(0, 0)], 2, 1, true)[0]).toBe("\x1b[31m*\x1b[0m");
    expect(renderFrame([p(0, 0)], 2, 1, false)[0]).toBe("*");
  });
});

describe("step", () => {
  it("falls by vy and drifts by vx (no jitter at random 0.5)", () => {
    const [moved] = step([{ ...p(2, 1), vx: 0.3, vy: 0.5 }], () => 0.5);
    expect(moved!.x).toBeCloseTo(2.3);
    expect(moved!.y).toBeCloseTo(1.5);
  });
});

describe("playConfetti", () => {
  it("writes nothing without a TTY", async () => {
    const written: string[] = [];
    await playConfetti({ isTTY: false, write: (s: string) => (written.push(s), true) } as never);
    expect(written).toEqual([]);
  });
});
