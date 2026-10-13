import { describe, expect, it } from 'vitest';
import { createSimulation, createSimulationFromParts, mintVehicleId } from '../index.ts';
import { generateCity } from '../city/generateCity.ts';
import { buildNetwork } from '../transport/network.ts';
import type { IncidentConfig } from '../incidents/incidents.ts';

function incidentCfg(id: string): IncidentConfig {
  return {
    id,
    kind: 'major-delay',
    label: 'test delay',
    startMin: 500,
    durationMin: 30,
    recoveryMin: 5,
    severity01: 0.4,
    delayMin: 4,
  };
}

describe('vehicle ids live in simulation state', () => {
  it('seeds the fleet with unique suffixed ids in route order', () => {
    const sim = createSimulation(1337);
    const ids = sim.vehicles.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const v of sim.vehicles) {
      expect(v.id).toMatch(/^veh-.+-n\d+$/);
    }
    // Suffixes mint 1..N in order, so the counter continues past the fleet.
    expect(sim.nextVehicleId).toBe(sim.vehicles.length + 1);
  });

  it('mints a state-derived sequence: two fresh sims mint identically', () => {
    const a = createSimulation(1337);
    const b = createSimulation(1337);
    const mintedA = [mintVehicleId(a), mintVehicleId(a), mintVehicleId(a)];
    const mintedB = [mintVehicleId(b), mintVehicleId(b), mintVehicleId(b)];
    expect(mintedA).toEqual(mintedB);
    expect(a.nextVehicleId).toBe(b.nextVehicleId);
    expect(a.nextVehicleId).toBe(a.vehicles.length + 1 + 3);
  });

  it('rebuilds mint identical id sequences', () => {
    const build = () => createSimulationFromParts(1337, generateCity(1337), buildNetwork());
    const a = build();
    const b = build();
    expect(a.vehicles.map((v) => v.id)).toEqual(b.vehicles.map((v) => v.id));
    expect(a.nextVehicleId).toBe(b.nextVehicleId);
  });
});

describe('nextIncidentId seeding', () => {
  it('starts at 1 with no seeded incidents', () => {
    expect(createSimulation(1337).nextIncidentId).toBe(1);
  });

  it('bumps past seeded inc-N ids but ignores inc-sched-*', () => {
    const sim = createSimulationFromParts(1337, generateCity(1337), {
      ...buildNetwork(),
      incidents: [incidentCfg('inc-3'), incidentCfg('inc-7'), incidentCfg('inc-sched-99'), incidentCfg('')],
    });
    expect(sim.incidents.map((i) => i.id)).toEqual(['inc-3', 'inc-7', 'inc-sched-99', 'inc-sched-3']);
    expect(sim.nextIncidentId).toBe(8);
  });
});
