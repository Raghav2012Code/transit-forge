import { describe, expect, it } from 'vitest';
import { generateCity } from '../city/generateCity.ts';
import { buildNetwork } from '../transport/network.ts';
import { networkThumbnail } from '../scenario/thumbnail.ts';

describe('scenario thumbnails', () => {
  it('renders deterministically from network data', () => {
    const city = generateCity(1337);
    const net = buildNetwork();
    const input = { stations: net.stations, routes: net.routes, zones: city.zones };
    const a = networkThumbnail(input);
    const b = networkThumbnail(input);
    expect(a).toBe(b);
    expect(a.startsWith('<svg')).toBe(true);
    // One path per route, one dot per station.
    expect(a.split('<path').length - 1).toBe(net.routes.length);
    expect(a.split('r="1.8"').length - 1).toBe(net.stations.length);
    // Route colors appear so lines match the 3D scene palette.
    for (const r of net.routes) expect(a).toContain(r.color);
  });

  it('survives empty input without throwing', () => {
    const svg = networkThumbnail({ stations: [], routes: [], zones: [] });
    expect(svg.startsWith('<svg')).toBe(true);
  });
});
