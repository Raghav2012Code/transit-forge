import { describe, expect, it } from 'vitest';
import { generateCity } from '../city/generateCity.ts';
import { buildNetwork } from '../transport/network.ts';
import { networkThumbnail } from '../scenario/thumbnail.ts';

describe('scenario thumbnails', () => {
  it('renders deterministically from network data', () => {
    const city = generateCity(1337);
    const net = buildNetwork();
    const input = { stations: net.stations, routes: net.routes, zones: city.zones };
    const a = networkThumbnail(input, 'dark');
    const b = networkThumbnail(input, 'dark');
    expect(a).toBe(b);
    expect(a.startsWith('<svg')).toBe(true);
    // One path per route, one dot per station.
    expect(a.split('<path').length - 1).toBe(net.routes.length);
    expect(a.split('r="1.8"').length - 1).toBe(net.stations.length);
    // Route colors appear so lines match the 3D scene palette.
    for (const r of net.routes) expect(a).toContain(r.color);
  });

  it('renders one plate per theme, so a card matches the page', () => {
    const city = generateCity(1337);
    const net = buildNetwork();
    const input = { stations: net.stations, routes: net.routes, zones: city.zones };
    const light = networkThumbnail(input, 'light');
    const dark = networkThumbnail(input, 'dark');
    expect(light).not.toBe(dark);
    expect(light).toContain('#e9ebef');
    expect(dark).toContain('#0b1020');
    // Deterministic within a theme too.
    expect(networkThumbnail(input, 'light')).toBe(light);
    // Lines stay the line colours in both themes.
    for (const r of net.routes) {
      expect(light).toContain(r.color);
      expect(dark).toContain(r.color);
    }
  });

  it('survives empty input without throwing', () => {
    const svg = networkThumbnail({ stations: [], routes: [], zones: [] }, 'light');
    expect(svg.startsWith('<svg')).toBe(true);
  });
});
