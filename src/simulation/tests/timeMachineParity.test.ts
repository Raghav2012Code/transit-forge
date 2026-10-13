import { describe, expect, it } from 'vitest';
import { generateCity } from '../city/generateCity.ts';
import { buildNetwork } from '../transport/network.ts';
import { createSimulationFromParts, stepSimulation } from '../index.ts';
import { applyEdits } from '../scenario/applyEdits.ts';
import type { EditOp } from '../scenario/scenario.ts';
import { applyFaresOpToSim, applyServiceOpToSim } from '../service/timedEdits.ts';
import { createIncidentInSim, type IncidentConfig } from '../incidents/incidents.ts';

const SEED = 1337;
const city = generateCity(SEED);
const base = buildNetwork();

// Timed-edit minutes (sim starts at 07:00 = 420).
const M1 = 500;
const M2 = 560;
const T_END = 660;

const SERVICE_PATCH = { vehicleCapacity: 1200 };
const FARES = { metro: 9, rail: 9, bus: 9 };

function incidentCfg(): IncidentConfig {
  return {
    id: 'inc-7',
    kind: 'major-delay',
    label: 'signal delays',
    targetRouteId: 'rt-m1',
    startMin: 480,
    durationMin: 45,
    recoveryMin: 10,
    severity01: 0.4,
    delayMin: 4,
  };
}

function ops(): EditOp[] {
  return [
    { type: 'setService', routeId: 'rt-m1', patch: SERVICE_PATCH, atMin: M1 },
    { type: 'setFares', fares: FARES, atMin: M2 },
    { type: 'scheduleIncident', incident: incidentCfg() },
  ];
}

// PARITY BOUNDARY (time-machine contract, tickets #9 + #7): the rebuild path
// applies timed edits from day start (effective all day), while the live path
// applies them when the clock reaches atMin — exactly what atMin MEANS. So
// crowd dynamics between 0..M1 legitimately diverge (capacity 1200 vs 800),
// and vehicle positions, loads, passenger aggregates, and the event log are
// NOT comparable across paths. What must converge — and is asserted below —
// is the ticket-meaningful state: service plans, fares, service offsets,
// incident ids/statuses/config, vehicle id sets, and both id counters. The
// capacity-only patch keeps the live reconcile a no-op (fleet size derives
// from headway/cycle, not capacity), matching App's reconcileFleet behavior.
describe('time-machine parity: rebuild-from-ops vs live application', () => {
  it('converges on service, fares, incidents, vehicle ids, and counters', () => {
    // Path A: rebuild — timed edits effective from day start.
    const mod = applyEdits(city, base, ops());
    let a = createSimulationFromParts(SEED, mod.city, mod);
    while (a.timeMinutes < T_END) a = stepSimulation(a, 1);

    // Path B: live — base sim, same edits applied at the same minutes.
    const baseMod = applyEdits(city, base, []);
    let b = createSimulationFromParts(SEED, baseMod.city, baseMod);
    createIncidentInSim(b, incidentCfg());
    // App-side half of the handshake (App.tsx createIncident/applyPreset):
    // preserve-without-bump leaves the counter behind an explicit inc-N id,
    // so App advances it past the pre-computed id.
    b.nextIncidentId = Math.max(b.nextIncidentId, 7 + 1);
    while (b.timeMinutes < T_END) {
      b = stepSimulation(b, 1);
      if (b.timeMinutes === M1) {
        expect(applyServiceOpToSim(b, 'rt-m1', SERVICE_PATCH)).toBe(true);
        // Mid-run contract: live state matches the asOfMin rebuild exactly.
        expect(b.service).toEqual(applyEdits(city, base, ops(), M1).service);
      }
      if (b.timeMinutes === M2) {
        applyFaresOpToSim(b, FARES);
        expect(b.fares).toEqual(applyEdits(city, base, ops(), M2).fares);
      }
    }

    // End-of-day convergence on the ticket-meaningful subset.
    expect(b.service).toEqual(a.service);
    expect(b.fares).toEqual(a.fares);
    expect(b.serviceOffsets).toEqual(a.serviceOffsets);
    expect(b.incidents.map((i) => ({ id: i.id, status: i.status }))).toEqual(
      a.incidents.map((i) => ({ id: i.id, status: i.status })),
    );
    for (const inc of b.incidents) {
      const other = a.incidents.find((x) => x.id === inc.id);
      expect(other).toBeDefined();
      for (const k of ['kind', 'label', 'targetRouteId', 'startMin', 'durationMin', 'recoveryMin', 'severity01', 'delayMin'] as const) {
        expect(inc[k]).toEqual(other![k]);
      }
    }
    expect(b.vehicles.map((v) => v.id).sort()).toEqual(a.vehicles.map((v) => v.id).sort());
    expect(b.nextVehicleId).toBe(a.nextVehicleId);
    expect(b.nextIncidentId).toBe(a.nextIncidentId);
  });
});
