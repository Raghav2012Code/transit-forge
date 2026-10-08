import { describe, expect, it } from 'vitest';
import { generateCity } from '../simulation/city/generateCity.ts';
import { buildNetwork } from '../simulation/transport/network.ts';
import type { IncidentConfig } from '../simulation/incidents/incidents.ts';
import type { EditOp } from '../simulation/scenario/scenario.ts';
import { handle, runDayFor, type RunDayRequest } from './handlers.ts';

const SEED = 1337;
const city = generateCity(SEED);
const net = buildNetwork();

function request(ops: EditOp[], incidents: IncidentConfig[], endMin: number): RunDayRequest {
  return { type: 'runDay', id: 7, seed: SEED, city, net, side: { ops, incidents }, endMin };
}

const slow: EditOp = { type: 'setService', routeId: 'rt-m1', patch: { peakHeadwayMin: 12, offPeakHeadwayMin: 20 }, atMin: 600 };

const closure: IncidentConfig = {
  id: 'inc-1',
  kind: 'station-closure',
  label: 'Closure',
  targetStationId: 'st-north-res',
  startMin: 540,
  durationMin: 60,
  recoveryMin: 15,
  severity01: 0.9,
};

describe('the day worker', () => {
  it('runs a day to the end minute and returns stats, a chart series and the cost', () => {
    const r = runDayFor(request([], [], 420 + 120));
    expect(r.stats.avgTravelMin).toBeGreaterThanOrEqual(0);
    expect(r.series.length).toBe(24); // one sample every 5 minutes
    expect(r.cost).toBe(0);
  });

  it('is deterministic', () => {
    const a = JSON.stringify(runDayFor(request([slow], [closure], 420 + 240)));
    const b = JSON.stringify(runDayFor(request([slow], [closure], 420 + 240)));
    expect(a).toBe(b);
  });

  it('is identical to the unedited day up to the minute the edit fires', () => {
    const end = 600; // the edit fires at 600
    const plain = runDayFor(request([], [], end));
    const edited = runDayFor(request([slow], [], end));
    expect(JSON.stringify(edited.stats)).toBe(JSON.stringify(plain.stats));
    expect(JSON.stringify(edited.series)).toBe(JSON.stringify(plain.series));
  });

  it('differs once the edit has fired', () => {
    const plain = runDayFor(request([], [], 900));
    const edited = runDayFor(request([slow], [], 900));
    expect(JSON.stringify(edited.stats)).not.toBe(JSON.stringify(plain.stats));
  });

  it('brings back an incident added by hand', () => {
    const plain = runDayFor(request([], [], 700));
    const hit = runDayFor(request([], [closure], 700));
    expect(JSON.stringify(hit.stats)).not.toBe(JSON.stringify(plain.stats));
  });

  it('is identical to the day without the incident until it starts', () => {
    const plain = runDayFor(request([], [], 540));
    const hit = runDayFor(request([], [closure], 540));
    expect(JSON.stringify(hit.stats)).toBe(JSON.stringify(plain.stats));
  });

  it('answers a message with a reply carrying its id', () => {
    const reply = handle(request([], [], 450));
    expect(reply.type).toBe('day');
    expect(reply.id).toBe(7);
  });

  it('answers a bad message with an error, not a crash', () => {
    const bad = { ...request([], [], 450), city: undefined as unknown as typeof city };
    const reply = handle(bad);
    expect(reply.type).toBe('error');
    expect(reply.id).toBe(7);
  });
});
