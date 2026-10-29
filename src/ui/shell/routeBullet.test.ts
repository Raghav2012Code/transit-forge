import { describe, expect, it } from 'vitest';
import { textOn } from './bulletInk.ts';

const relLum = (hex: string): number => {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('route bullet ink', () => {
  it('keeps white on the darker line colours and flips to ink on light ones', () => {
    expect(textOn('#c0392f')).toBe('#ffffff');
    expect(textOn('#1b6fc4')).toBe('#ffffff');
    expect(textOn('#facc15')).toBe('#15181c');
    expect(textOn('#a3e635')).toBe('#15181c');
  });

  it('picks whichever ink actually has the higher contrast', () => {
    for (const colour of ['#808080', '#767676', '#8a8a8a', '#e0a21a', '#6d4bb8']) {
      const chosen = textOn(colour);
      const other = chosen === '#ffffff' ? '#15181c' : '#ffffff';
      expect(contrast(colour, chosen)).toBeGreaterThanOrEqual(contrast(colour, other));
    }
  });

  it('falls back to white for a malformed colour', () => {
    expect(textOn('not-a-colour')).toBe('#ffffff');
  });
});
