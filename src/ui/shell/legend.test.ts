import { describe, expect, it } from 'vitest';
import { legendEntries } from './legendEntries.ts';
import { getPalette, hexColor as hex } from '../../rendering/palette.ts';

const hexes = (gradient: string): string[] => gradient.match(/#[0-9a-f]{6}/gi) ?? [];

describe('legend mirrors the scene palette', () => {
  for (const theme of ['light', 'dark'] as const) {
    it(`draws every ${theme} ramp from that palette's values`, () => {
      const P = getPalette(theme);
      const allowed = new Set([
        ...Object.values(P.condition.congestion),
        ...Object.values(P.condition.grade),
        ...Object.values(P.ramp),
        P.condition.alarm,
        P.condition.warn,
        P.condition.good,
        P.condition.hot,
      ].map(hex));
      for (const entry of Object.values(legendEntries(theme))) {
        if (entry.kind !== 'ramp') continue;
        for (const value of hexes(entry.gradient)) expect(allowed.has(value)).toBe(true);
      }
    });
  }

  it('gives the critical ramp the palette low end in each theme', () => {
    const light = legendEntries('light').critical;
    const dark = legendEntries('dark').critical;
    expect(light?.kind).toBe('ramp');
    expect(dark?.kind).toBe('ramp');
    if (light?.kind !== 'ramp' || dark?.kind !== 'ramp') return;
    expect(light.gradient).toContain(hex(getPalette('light').ramp.blueLow));
    expect(dark.gradient).toContain(hex(getPalette('dark').ramp.blueLow));
    expect(dark.gradient).not.toBe(light.gradient);
  });

  it('uses condition colours for status instead of hard-coded reds', () => {
    const status = legendEntries('dark').status;
    expect(status?.kind).toBe('keys');
    if (status?.kind !== 'keys') return;
    expect(status.rows[0].color).toBe(hex(getPalette('dark').condition.alarm));
  });
});
