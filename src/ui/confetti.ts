import { setTimeout as sleep } from "node:timers/promises";

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  char: string;
  color: number;
}

const CHARS = ["*", "•", "▪", "✦", "◆"];
const COLORS = [31, 32, 33, 34, 35, 36];
const HEIGHT = 8;
const FRAMES = 24;
const FRAME_MS = 50;

const pick = <T>(items: T[], random: () => number): T => items[Math.floor(random() * items.length)]!;

/** Particles spread across the width, starting above the region so they rain in staggered. */
export function spawn(count: number, width: number, height: number, random: () => number): Particle[] {
  return Array.from({ length: count }, () => ({
    x: random() * width,
    y: -random() * height,
    vx: (random() - 0.5) * 0.8,
    vy: 0.4 + random() * 0.6,
    char: pick(CHARS, random),
    color: pick(COLORS, random),
  }));
}

/** One tick: fall by vy, drift by vx plus a little jitter. */
export function step(particles: Particle[], random: () => number): Particle[] {
  return particles.map((p) => ({ ...p, x: p.x + p.vx + (random() - 0.5) * 0.4, y: p.y + p.vy }));
}

/** Exactly `height` lines; particles outside the region are not drawn. */
export function renderFrame(particles: Particle[], width: number, height: number, color: boolean): string[] {
  const grid: (Particle | null)[][] = Array.from({ length: height }, () => Array<Particle | null>(width).fill(null));
  for (const p of particles) {
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (x >= 0 && x < width && y >= 0 && y < height) grid[y]![x] = p;
  }
  return grid.map((row) =>
    row
      .map((p) => (p ? (color ? `\x1b[${p.color}m${p.char}\x1b[0m` : p.char) : " "))
      .join("")
      .trimEnd(),
  );
}

type Out = Pick<NodeJS.WriteStream, "write"> & { isTTY?: boolean; columns?: number };

/** ~1.2s of falling confetti in an 8-line region below the cursor, erased afterwards. No-op without a TTY. */
export async function playConfetti(out: Out = process.stdout, random: () => number = Math.random): Promise<void> {
  if (!out.isTTY) return;
  const width = Math.min(out.columns ?? 60, 60);
  const color = !process.env.NO_COLOR;
  const draw = (lines: string[]) => out.write(lines.map((line) => `\r\x1b[2K${line}`).join("\n") + `\x1b[${HEIGHT - 1}A\r`);

  const restore = () => out.write("\x1b[?25h");
  const onSigint = () => {
    draw(Array<string>(HEIGHT).fill(""));
    restore();
    process.exit(0);
  };
  process.once("SIGINT", onSigint);
  out.write("\x1b[?25l" + "\n".repeat(HEIGHT - 1) + `\x1b[${HEIGHT - 1}A\r`);
  try {
    let particles = spawn(Math.round(width * 0.6), width, HEIGHT, random);
    for (let i = 0; i < FRAMES; i++) {
      draw(renderFrame(particles, width, HEIGHT, color));
      particles = step(particles, random);
      await sleep(FRAME_MS);
    }
  } finally {
    draw(Array<string>(HEIGHT).fill(""));
    restore();
    process.off("SIGINT", onSigint);
  }
}
