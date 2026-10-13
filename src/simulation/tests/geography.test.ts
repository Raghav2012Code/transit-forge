import { describe, expect, it } from 'vitest';
import { generateCity } from '../city/generateCity.ts';
import { CITY_BOUNDS, coastXAt, crossesRiver, riverCentreX, RIVER_HALF_M, WORLD_SCALE } from '../city/geography.ts';
import { buildNetwork } from '../transport/network.ts';
import { validateRoadNode, validateStationPlacement } from '../scenario/scenario.ts';

describe('geography is one thing', () => {
  const city = generateCity(1337);

  it('draws the river where the rules put it', () => {
    for (const p of city.river) expect(p.x).toBeCloseTo(riverCentreX(p.z), 9);
  });

  it('draws the coast where the rules put it', () => {
    for (const p of city.coast) expect(p.x).toBeCloseTo(coastXAt(p.z), 9);
  });

  it('rejects stations on the water, at the shore and on the river, wherever they are', () => {
    for (let z = -400; z <= 400; z += 40) {
      expect(validateStationPlacement(coastXAt(z) - 20, z)).toBe('Cannot build on water');
      expect(validateStationPlacement(coastXAt(z) + 4, z)).toBe('Cannot build on water');
      expect(validateStationPlacement(riverCentreX(z), z)).toBe('Too close to the river');
      expect(validateStationPlacement(riverCentreX(z) + RIVER_HALF_M + 4, z)).toBe('Too close to the river');
    }
  });

  it('accepts a station on dry land beside neither', () => {
    expect(validateStationPlacement(coastXAt(0) + 40, 0)).toBeNull();
    expect(validateStationPlacement(riverCentreX(100) + RIVER_HALF_M + 20, 100)).toBeNull();
    expect(validateStationPlacement(CITY_BOUNDS.x + 100, 0)).toBe('Outside city bounds');
  });

  it('lets a road cross the river but not run into the sea', () => {
    expect(validateRoadNode(riverCentreX(0), 0)).toBeNull();
    expect(validateRoadNode(coastXAt(0) - 5, 0)).toBe('Cannot build on water');
    expect(validateRoadNode(coastXAt(0) + 20, 0)).toBeNull();
  });

  it('knows which segments are bridges', () => {
    const c = riverCentreX(0);
    const h = RIVER_HALF_M;
    // A segment that spans the river is a bridge; one wholly on either bank is not.
    expect(crossesRiver(c - (h + 25), 0, c + (h + 25), 0)).toBe(true);
    expect(crossesRiver(c + (h + 15), 0, c + (h + 75), 0)).toBe(false);
    expect(crossesRiver(c - (h + 75), 0, c - (h + 15), 0)).toBe(false);
  });

  it('scales a station-to-station distance by the world constant', () => {
    // The station specs are hand-authored at compact scale and multiplied by
    // WORLD_SCALE; central (0,0) and mid-north (-20,-140) are 141.4 m apart on
    // the compact map, so they must be WORLD_SCALE x that in the real world.
    const net = buildNetwork();
    const byId = new Map(net.stations.map((s) => [s.id, s.pos]));
    const a = byId.get('st-central');
    const b = byId.get('st-mid-north');
    expect(a && b).toBeTruthy();
    const d = Math.hypot(a!.x - b!.x, a!.z - b!.z);
    expect(d).toBeCloseTo(WORLD_SCALE * Math.hypot(20, 140), 6);
  });
});
