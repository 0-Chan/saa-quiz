/** Terminal columns: Hangul and other East Asian wide characters take two. */
export function displayWidth(s: string): number {
  let width = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    const wide =
      (c >= 0x1100 && c <= 0x115f) || // Hangul Jamo
      (c >= 0x2e80 && c <= 0xa4cf) || // CJK, Hangul compatibility Jamo
      (c >= 0xac00 && c <= 0xd7a3) || // Hangul syllables
      (c >= 0xf900 && c <= 0xfaff) || // CJK compatibility ideographs
      (c >= 0xff00 && c <= 0xff60) || // fullwidth forms
      (c >= 0xffe0 && c <= 0xffe6);
    width += wide ? 2 : 1;
  }
  return width;
}

/** Pad `label` with spaces to `width` columns. */
export function padLabel(label: string, width: number): string {
  return label + " ".repeat(Math.max(0, width - displayWidth(label)));
}
