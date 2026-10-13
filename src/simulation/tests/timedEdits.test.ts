import { describe, expect, it } from 'vitest';
import { generateCity } from '../city/generateCity.ts';
import { buildNetwork } from '../transport/network.ts';
import { createSimulationFromParts } from '../index.ts';
import { applyEdits } from '../scenario/applyEdits.ts';
import { sanitizeAtMin, type EditOp } from '../scenario/scenario.ts';
import { applyFaresOpToSim, applyServiceOpToSim } from '../service/timedEdits.ts';

const SEED = 1337;
const city = generateCity(SEED);
const base = buildNetwork();

describe('sanitizeAtMin', () => {
  it('passes undefined through and floors/clamps numbers', () => {
    expect(sanitizeAtMin(undefined)).toBe(undefined);
    expect(sanitizeAtMin(62.9)).toBe(62);
    expect(sanitizeAtMin(-5)).toBe(0);
    expect(sanitizeAtMin(2000)).toBe(1440);
    expect(sanitizeAtMin(0)).toBe(0);
    expect(sanitizeAtMin(1440)).toBe(1440);
  });
});

describe('timed setService in applyEdits', () => {
  it('keeps untimed ops behavior-identical (default asOfMin applies all)', () => {
    const ops: EditOp[] = [
      { type: 'setService', routeId: 'rt-m1', patch: { peakHeadwayMin: 3 } },
      { type: 'setService', routeId: 'rt-m1', patch: { peakHeadwayMin: 9 }, atMin: 600 },
    ];
    const mod = applyEdits(city, base, ops);
    expect(mod.service['rt-m1'].peakHeadwayMin).toBe(9);
  });

  it('skips ops with atMin > asOfMin and applies those <= asOfMin', () => {
    const ops: EditOp[] = [
      { type: 'setService', routeId: 'rt-m1', patch: { peakHeadwayMin: 3 }, atMin: 120 },
      { type: 'setService', routeId: 'rt-m1', patch: { peakHeadwayMin: 9 }, atMin: 600 },
    ];
    const early = applyEdits(city, base, ops, 300);
    expect(early.service['rt-m1'].peakHeadwayMin).toBe(3);
    const late = applyEdits(city, base, ops, 600);
    expect(late.service['rt-m1'].peakHeadwayMin).toBe(9);
    const none = applyEdits(city, base, ops, 0);
    expect(none.service['rt-m1'].peakHeadwayMin).not.toBe(3);
  });

  it('lets later effective ops win, ignoring later-but-ineffective ones', () => {
    const ops: EditOp[] = [
      { type: 'setService', routeId: 'rt-m1', patch: { peakHeadwayMin: 3 }, atMin: 100 },
      { type: 'setService', routeId: 'rt-m1', patch: { peakHeadwayMin: 6 }, atMin: 200 },
      { type: 'setService', routeId: 'rt-m1', patch: { peakHeadwayMin: 12 }, atMin: 900 },
    ];
    const mod = applyEdits(city, base, ops, 300);
    expect(mod.service['rt-m1'].peakHeadwayMin).toBe(6);
  });

  it('skips future ops silently without warnings', () => {
    const ops: EditOp[] = [
      { type: 'setService', routeId: 'rt-m1', patch: { peakHeadwayMin: 3 }, atMin: 900 },
    ];
    const mod = applyEdits(city, base, ops, 100);
    expect(mod.warnings).toEqual([]);
  });
});

describe('timed setFares in applyEdits', () => {
  const A = { metro: 5, rail: 5, bus: 5 };
  const B = { metro: 10, rail: 10, bus: 10 };

  it('picks the last effective op; untimed counts as always effective', () => {
    const timed: EditOp[] = [
      { type: 'setFares', fares: A, atMin: 100 },
      { type: 'setFares', fares: B, atMin: 200 },
    ];
    expect(applyEdits(city, base, timed, 50).fares).toEqual({ metro: 0, rail: 0, bus: 0 });
    expect(applyEdits(city, base, timed, 150).fares).toEqual(A);
    expect(applyEdits(city, base, timed, 300).fares).toEqual(B);
    const mixed: EditOp[] = [
      { type: 'setFares', fares: A, atMin: 100 },
      { type: 'setFares', fares: B },
    ];
    expect(applyEdits(city, base, mixed, 50).fares).toEqual(B);
    expect(applyEdits(city, base, mixed, 200).fares).toEqual(B);
  });

  it('lets an earlier untimed op beat a later timed one when the timed is ineffective', () => {
    const ops: EditOp[] = [
      { type: 'setFares', fares: B },
      { type: 'setFares', fares: A, atMin: 900 },
    ];
    expect(applyEdits(city, base, ops, 100).fares).toEqual(B);
    expect(applyEdits(city, base, ops, 1000).fares).toEqual(A);
  });
});

describe('timedEdits live application', () => {
  it('returns false for unknown routes and applies fares headless', () => {
    const mod = applyEdits(city, base, []);
    const sim = createSimulationFromParts(SEED, mod.city, mod);
    expect(applyServiceOpToSim(sim, 'nope', { peakHeadwayMin: 3 })).toBe(false);
    applyFaresOpToSim(sim, { metro: 7, rail: 7, bus: 7 });
    expect(sim.fares).toEqual({ metro: 7, rail: 7, bus: 7 });
  });

  it('matches day-start applyEdits(asOfMin) service/fares via live application', () => {
    const M = 500;
    const ops: EditOp[] = [
      { type: 'setService', routeId: 'rt-m1', patch: { peakHeadwayMin: 3, vehicleCapacity: 500 }, atMin: 100 },
      { type: 'setService', routeId: 'rt-m1', patch: { peakHeadwayMin: 6 }, atMin: 800 },
      { type: 'setFares', fares: { metro: 8, rail: 8, bus: 8 }, atMin: 200 },
      { type: 'setFares', fares: { metro: 12, rail: 12, bus: 12 }, atMin: 900 },
    ];
    const dayStart = applyEdits(city, base, ops, M);
    const simDay = createSimulationFromParts(SEED, dayStart.city, dayStart);

    const all = applyEdits(city, base, ops);
    const simLive = createSimulationFromParts(SEED, all.city, all);
    for (const op of ops) {
      if (op.type !== 'setService' && op.type !== 'setFares') continue;
      if ((op.atMin ?? -Infinity) > M) continue;
      if (op.type === 'setService') expect(applyServiceOpToSim(simLive, op.routeId, op.patch)).toBe(true);
      else applyFaresOpToSim(simLive, op.fares);
    }

    expect(simLive.service).toEqual(simDay.service);
    expect(simLive.fares).toEqual(dayStart.fares);
    expect(simLive.serviceOffsets).toEqual(simDay.serviceOffsets);
    for (const vv of simLive.vehicles) {
      expect(vv.capacity).toBe(simLive.service[vv.routeId].vehicleCapacity);
    }
  });
});
