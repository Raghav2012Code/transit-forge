import { describe, expect, it } from 'vitest';
import { createSimulation } from '../index.ts';
import { applyFares, applyServicePatch } from '../service/live.ts';

const ROUTE = 'rt-m1';

function fresh() {
  return createSimulation(1337);
}

describe('applyServicePatch', () => {
  it('changes the plan, the phase and the capacity of that route only', () => {
    const sim = fresh();
    const before = sim.service[ROUTE];
    const other = { ...sim.service['rt-m2'] };
    const applied = applyServicePatch(sim, ROUTE, { peakHeadwayMin: 4, vehicleCapacity: 400 });
    expect(applied).toEqual({ peakHeadwayMin: 4, vehicleCapacity: 400 });
    expect(sim.service[ROUTE].peakHeadwayMin).toBe(4);
    expect(sim.service[ROUTE].peakHeadwayMin).not.toBe(before.peakHeadwayMin);
    expect(sim.vehicles.filter((v) => v.routeId === ROUTE).every((v) => v.capacity === 400)).toBe(true);
    expect(sim.service['rt-m2']).toEqual(other);
  });

  it('clamps a patch to the mode\'s bounds and returns what it applied', () => {
    const sim = fresh();
    const applied = applyServicePatch(sim, ROUTE, { peakHeadwayMin: 0 });
    expect(applied?.peakHeadwayMin).toBeGreaterThan(0);
    expect(sim.service[ROUTE].peakHeadwayMin).toBe(applied?.peakHeadwayMin);
  });

  it('returns null and changes nothing for an unknown route', () => {
    const sim = fresh();
    const snapshot = JSON.stringify(sim.service);
    expect(applyServicePatch(sim, 'rt-nope', { peakHeadwayMin: 4 })).toBeNull();
    expect(JSON.stringify(sim.service)).toBe(snapshot);
  });

  it('grows the fleet to a requested size, with ids drawn from the sim\'s own counter', () => {
    const sim = fresh();
    const had = sim.vehicles.filter((v) => v.routeId === ROUTE).length;
    applyServicePatch(sim, ROUTE, { fleetSize: had + 3 });
    const now = sim.vehicles.filter((v) => v.routeId === ROUTE);
    expect(now).toHaveLength(had + 3);
    expect(sim.fleetNonce).toBe(3);
    expect(now.filter((v) => /-n\d+$/.test(v.id))).toHaveLength(3);
  });

  it('gives the same ids when the same edit is applied to a second sim', () => {
    const a = fresh();
    const b = fresh();
    applyServicePatch(a, ROUTE, { fleetSize: 8 });
    applyServicePatch(b, ROUTE, { fleetSize: 8 });
    expect(a.vehicles.map((v) => v.id)).toEqual(b.vehicles.map((v) => v.id));
  });

  it('shrinks the fleet by dropping empty vehicles only', () => {
    const sim = fresh();
    applyServicePatch(sim, ROUTE, { fleetSize: 8 });
    const aboard = sim.vehicles.filter((v) => v.routeId === ROUTE)[0];
    aboard.riders = [1, 2, 3];
    applyServicePatch(sim, ROUTE, { fleetSize: 2 });
    const left = sim.vehicles.filter((v) => v.routeId === ROUTE);
    expect(left.some((v) => v.id === aboard.id)).toBe(true);
    expect(left.length).toBeLessThanOrEqual(3);
    expect(left.length).toBeGreaterThanOrEqual(2);
  });
});

describe('applyFares', () => {
  it('stores sanitized fares and returns them', () => {
    const sim = fresh();
    const applied = applyFares(sim, { metro: 7, rail: -3, bus: 999 });
    expect(applied).toEqual({ metro: 7, rail: 0, bus: 50 });
    expect(sim.fares).toEqual(applied);
  });
});
