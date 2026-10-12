// The product mark: the route bullet. This is the one definition of its geometry
// in code, shared by the workspace masthead and the plan report. The favicon
// asset and the landing page mirror it — deliberately, with no shared-SVG build
// step (DESIGN.md, "Signature move").
//
// A blue chip carrying the interchange glyph: three lines meeting at one node, a
// station node at each tip, and the larger interchange node at the hub.

/**
 * The chip's colour: the flagship metro blue (`--line-blue`). Held as a literal,
 * not read from CSS, because the same value has to be identical in the app, the
 * exported report, the favicon asset and the landing page — and three of those
 * cannot read a custom property. Line colours are mid-tone on purpose and do not
 * move between themes, so the mark reads on either ground.
 */
export const BRAND_BLUE = '#1b6fc4';

/** The glyph is set in white on that chip, the way every bullet in the app is set. */
export const BRAND_ON = '#ffffff';

/** The width the interchange lines are drawn at. */
export const BRAND_STROKE = 3;

/** The mark's own canvas. */
export const BRAND_VIEW_BOX = '0 0 32 32';

/** The three lines, meeting at the hub. */
export const BRAND_SPOKES: readonly string[] = ['M16 16V5.8', 'M16 16 7.4 20.6', 'M16 16l8.6 4.6'];

/** A station node at each tip, then the larger node at the hub. */
export const BRAND_NODES: readonly (readonly [number, number, number])[] = [
  [16, 5.8, 2.5],
  [7.4, 20.6, 2.5],
  [24.6, 20.6, 2.5],
  [16, 16, 3.3],
];

/**
 * The interchange glyph on its own, drawn in one ink. This is the form a printed
 * page can hold: no chip, so nothing depends on a background colour surviving the
 * printer. Decorative — the product's name sits beside it.
 */
export function brandGlyphSvg(ink: string, size: number): string {
  const spokes = BRAND_SPOKES.map((d) => `<path d="${d}"/>`).join('');
  const nodes = BRAND_NODES.map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`).join('');
  return (
    `<svg width="${size}" height="${size}" viewBox="${BRAND_VIEW_BOX}" aria-hidden="true" focusable="false">` +
    `<g stroke="${ink}" stroke-width="${BRAND_STROKE}" stroke-linecap="round" fill="none">${spokes}</g>` +
    `<g fill="${ink}">${nodes}</g>` +
    `</svg>`
  );
}
