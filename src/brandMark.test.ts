/// <reference types="node" />
// ^ this one file reads a shipped asset off disk; the app's own tsconfig keeps
//   Node globals out of the interface and simulation code.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BRAND_BLUE, BRAND_SPOKES, brandGlyphSvg } from './brandMark.ts';

// The mark is defined once in code and mirrored by the favicon asset and the
// landing page. These guard the mirror: a redraw that forgets the tab, or a
// favicon recoloured out of the design system, fails here rather than in the
// browser where nobody is looking.
describe('the product mark', () => {
  it('ships a favicon asset carrying the same geometry as the code', () => {
    const svg = readFileSync('public/favicon.svg', 'utf8');
    expect(svg).toContain(BRAND_BLUE);
    for (const d of BRAND_SPOKES) expect(svg).toContain(d);
  });

  it('draws the report glyph in one ink, and announces nothing', () => {
    const svg = brandGlyphSvg('#111', 30);
    expect(svg).toContain('aria-hidden="true"');
    const inks = [...new Set(svg.match(/#[0-9a-fA-F]{3,6}/g) ?? [])];
    expect(inks).toEqual(['#111']);
  });
});
