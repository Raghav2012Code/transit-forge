import { describe, expect, it } from 'vitest';
import { createSimulation, stepSimulation } from '../../simulation/index.ts';
import { findTrip, recentRows, ridersOf, tripNames, waitingAt } from './trips.ts';

function run(ticks: number) {
  let sim = createSimulation(1337);
  for (let i = 0; i < ticks; i++) sim = stepSimulation(sim, 1);
  return sim;
}

describe('trip lists', () => {
  const sim = run(180);

  it('names zones, stations and routes, falling back to the id', () => {
    const n = tripNames(sim);
    expect(n.zone(sim.city.zones[0].id)).toBe(sim.city.zones[0].name);
    expect(n.station(sim.stations[0].id)).toBe(sim.stations[0].name);
    expect(n.route(sim.routes[0].id)).toBe(sim.routes[0].name);
    expect(n.zone('nope')).toBe('nope');
  });

  it('lists a vehicle\'s riders and no one else', () => {
    const v = sim.vehicles.find((x) => x.riders.length > 0);
    expect(v).toBeDefined();
    const rows = ridersOf(sim, v!.id);
    expect(rows.map((r) => r.id).sort((a, b) => a - b)).toEqual([...v!.riders].sort((a, b) => a - b));
    expect(ridersOf(sim, 'no-such-vehicle')).toEqual([]);
  });

  it('lists those waiting at a station', () => {
    const st = sim.stations.find((s) => sim.passengers.some((p) => p.atStation === s.id && p.state === 'WAITING'));
    expect(st).toBeDefined();
    const rows = waitingAt(sim, st!.id);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.kind === 'transit')).toBe(true);
  });

  it('puts the stranded first', () => {
    const copy = run(60);
    const waiting = copy.passengers.filter((p) => p.state === 'WAITING' && p.atStation);
    expect(waiting.length).toBeGreaterThan(1);
    const last = waiting[waiting.length - 1];
    last.state = 'STRANDED';
    last.strandedMin = 7;
    const rows = waitingAt(copy, last.atStation!);
    expect(rows[0].tone).toBe('alert');
    expect(rows[0].id).toBe(last.id);
  });

  it('lists recent trips newest first', () => {
    const rows = recentRows(sim);
    expect(rows.length).toBeGreaterThan(0);
    const newest = sim.recentTrips[sim.recentTrips.length - 1];
    expect(rows[0].id).toBe(newest.id);
    expect(rows[0].kind).toBe(newest.kind);
  });

  it('finds a live trip, then a finished one, then nothing', () => {
    const live = sim.passengers[0];
    expect(findTrip(sim, live.id, 'transit')?.end).toBe('active');
    const done = sim.recentTrips[0];
    expect(findTrip(sim, done.id, done.kind)?.end).toBe(done.end);
    expect(findTrip(sim, 99_999_999, 'transit')).toBeNull();
  });

  it('does not confuse a car and a passenger that share an id', () => {
    const car = sim.cars[0];
    expect(findTrip(sim, car.id, 'car')?.kind).toBe('car');
  });
});
