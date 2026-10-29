const INK = '#15181c';

function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Relative luminance of the bullet ink, used as the denominator of its contrast. */
const INK_LUMINANCE = luminance(INK) ?? 0;

/**
 * White text fails on a light line colour, so the bullet flips to ink — the
 * same reason a yellow line's bullet is set in black on a real sign. Compare
 * the two real contrast ratios (ink's own luminance included), not a guess.
 */
export function textOn(hex: string): string {
  const lum = luminance(hex);
  if (lum === null) return '#ffffff';
  const againstWhite = 1.05 / (lum + 0.05);
  const againstInk = (lum + 0.05) / (INK_LUMINANCE + 0.05);
  return againstWhite >= againstInk ? '#ffffff' : INK;
}
