import { describe, expect, it } from 'vitest';
import { generateCity } from '../city/generateCity.ts';
import {
  ZONE_ACCESS,
  buildDemandMatrix,
  destWeight,
  hourShare,
  periodFactor,
  periodOf,
} from '../passengers/demand.ts';

const zones = generateCity(1337).zones;
const zoneById = new Map(zones.map((z) => [z.id, z]));
const maxJobs = Math.max(...zones.map((z) => z.jobs));
const maxPop = Math.max(...zones.map((z) => z.population));

describe('O/D demand', () => {
  it('builds a deterministic matrix with no self-pairs', () => {
    const a = buildDemandMatrix(zones);
    const b = buildDemandMatrix(zones);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.totalDaily).toBeGreaterThan(1000);
    for (const p of a.pairs) expect(p.from).not.toBe(p.to);
    // Every zone can reach the network.
    for (const z of zones) expect(ZONE_ACCESS[z.id]).toBeDefined();
  });

  it('sends AM demand toward jobs and PM demand home', () => {
    const res = zoneById.get('z-res-n');
    const cbd = zoneById.get('z-cbd');
    if (!res || !cbd) throw new Error('missing zones');
    const amOut = periodFactor(res, cbd, 'AM', maxJobs, maxPop);
    const pmOut = periodFactor(res, cbd, 'PM', maxJobs, maxPop);
    expect(amOut).toBeGreaterThan(pmOut);
    const amBack = periodFactor(cbd, res, 'AM', maxJobs, maxPop);
    const pmBack = periodFactor(cbd, res, 'PM', maxJobs, maxPop);
    expect(pmBack).toBeGreaterThan(amBack);
  });

  it('gives the airport distinct attraction', () => {
    const res = zoneById.get('z-res-w');
    const air = zoneById.get('z-air');
    const suburb = zoneById.get('z-sub-s');
    if (!res || !air || !suburb) throw new Error('missing zones');
    expect(destWeight(res, air, 'AM', maxJobs, maxPop)).toBeGreaterThan(
      destWeight(res, suburb, 'AM', maxJobs, maxPop),
    );
  });

  it('normalizes hourly shares and classifies periods', () => {
    let sum = 0;
    for (let h = 0; h < 24; h++) sum += hourShare(h);
    expect(sum).toBeCloseTo(1, 6);
    expect(hourShare(8)).toBeGreaterThan(hourShare(3));
    expect(periodOf(8 * 60)).toBe('AM');
    expect(periodOf(12 * 60)).toBe('MID');
    expect(periodOf(18 * 60)).toBe('PM');
    expect(periodOf(2 * 60)).toBe('NIGHT');
  });
});
