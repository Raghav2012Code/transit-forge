import { describe, expect, it } from 'vitest';
import { generateCity } from '../city/generateCity.ts';
import { buildNetwork } from '../transport/network.ts';
import { networkThumbnail } from '../scenario/thumbnail.ts';

function input(seed = 1337) {
  return { city: generateCity(seed), stations: buildNetwork().stations, routes: buildNetwork().routes };
}

/** Every radius the drawing uses, so a stray giant ring cannot come back. */
function radii(svg: string): number[] {
  return [...svg.matchAll(/r="([\d.]+)"/g)].map((m) => Number(m[1]));
}

describe('scenario thumbnails', () => {
  it('draws the same plan every time, from the city the simulation holds', () => {
    const a = networkThumbnail(input());
    const b = networkThumbnail(input());
    expect(a).toBe(b);
    expect(a.startsWith('<svg')).toBe(true);
    // One path per route (plus the river), one dot per station.
    expect(a.split('<path').length - 1).toBe(input().routes.length + 1);
    expect(radii(a).length).toBe(input().stations.length);
    // Route colours appear, so the plan matches the scene palette.
    for (const r of input().routes) expect(a).toContain(r.color);
  });

  it('shows the city, not an abstract graph', () => {
    const svg = networkThumbnail(input());
    // The shoreline and the river are what make it a place.
    expect(svg).toContain('var(--mm-river)');
    expect(svg).toContain('<polygon');           // the sea
    expect(svg).toContain('var(--mm-arterial)'); // road grid
    expect(svg).toContain('var(--mm-station)');  // station dots
    expect(svg).toContain('var(--plate)');       // the plate under it
  });

  it('never draws a district as a giant ring', () => {
    // The old drawing rendered each district's radius as an outline, which read
    // as overlapping soap bubbles and was the loudest thing in the figure.
    const svg = networkThumbnail(input());
    const rs = radii(svg);
    expect(rs.length).toBeGreaterThan(0);
    expect(Math.max(...rs)).toBeLessThanOrEqual(3);
  });

  it('takes its colours from the theme tokens, so it follows the theme', () => {
    const svg = networkThumbnail(input());
    // No hardcoded plate or map colours: the DOM supplies them per theme.
    expect(svg).not.toContain('#0b1020');
    expect(svg).not.toContain('#e9ebef');
    expect(svg).toContain('var(--mm-');
  });

  it('projects every coordinate to a number', () => {
    // A misplaced argument (a point where a number was wanted) silently turned
    // projected coordinates into NaN and collapsed the sea to nothing.
    const svg = networkThumbnail(input());
    expect(svg).not.toContain('NaN');
    expect(svg).not.toContain('null');
    expect(svg).not.toContain('undefined');
  });

  it('survives an empty city without throwing', () => {
    const svg = networkThumbnail({ city: generateCity(1337), stations: [], routes: [] });
    expect(svg.startsWith('<svg')).toBe(true);
  });
});
