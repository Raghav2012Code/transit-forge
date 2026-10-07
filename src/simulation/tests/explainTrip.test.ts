import { describe, expect, it } from 'vitest';
import type { TripDecision, TripRecord } from '../../types/index.ts';
import { explainTrip, type TripNames } from '../passengers/explainTrip.ts';
import { pushTrip, RECENT_TRIPS } from '../passengers/tripRecord.ts';

const names: TripNames = {
  zone: (id) => `Zone ${id}`,
  station: (id) => `Stn ${id}`,
  route: (id) => `Line ${id}`,
  clock: (m) => `t${Math.round(m)}`,
};

const both: TripDecision = {
  options: 'both', chose: 'transit', transitMin: 24, transfers: 1, roadMin: 31, fare: 0, pCar: 0.38, carFailed: false,
};

function trip(over: Partial<TripRecord> = {}): TripRecord {
  return {
    id: 1, kind: 'transit', originZone: 'a', destZone: 'b', purpose: 'work', departMin: 420, endMin: 450,
    end: 'arrived', state: 'ARRIVED', decision: both,
    legs: [{ board: 's1', alight: 's2', routeId: 'r1' }],
    waitMin: 9, travelMin: 30, transfers: 0, strandedMin: 0, farePaid: 0, ...over,
  };
}

const byId = (list: ReturnType<typeof explainTrip>, id: string) => list.find((s) => s.id === id);

describe('explainTrip', () => {
  it('says why transit won, with both times and the chance of driving', () => {
    const c = byId(explainTrip(trip(), names), 'choice')!;
    expect(c.text).toContain('Chose transit');
    expect(c.text).toContain('24 min');
    expect(c.text).toContain('31 min');
    expect(c.text).toContain('38%');
    expect(c.tone).toBe('neutral');
  });

  it('says why the car won', () => {
    const c = byId(explainTrip(trip({ kind: 'car', legs: [], decision: { ...both, chose: 'car' } }), names), 'choice')!;
    expect(c.text).toContain('Chose the car');
    expect(c.text).toContain('31 min');
  });

  it('flags a car choice that fell back to transit', () => {
    const c = byId(explainTrip(trip({ decision: { ...both, carFailed: true } }), names), 'choice')!;
    expect(c.tone).toBe('watch');
    expect(c.text).toContain('no room');
  });

  it('handles the forced cases', () => {
    const t = explainTrip(trip({ decision: { ...both, options: 'transit-only', roadMin: null, pCar: null } }), names);
    expect(byId(t, 'choice')!.text).toContain('only option');
    const r = explainTrip(
      trip({ kind: 'car', legs: [], decision: { ...both, options: 'road-only', chose: 'car', transitMin: null, transfers: null, pCar: null } }),
      names,
    );
    expect(byId(r, 'choice')!.text).toContain('road was the only option');
  });

  it('lists each ride in order', () => {
    const t = explainTrip(
      trip({
        legs: [
          { board: 's1', alight: 's2', routeId: 'r1' },
          { board: 's2', alight: 's3', routeId: 'r2' },
        ],
      }),
      names,
    );
    const legs = t.filter((s) => s.id.startsWith('leg-')).map((s) => s.text);
    expect(legs).toHaveLength(2);
    expect(legs[0]).toContain('Line r1');
    expect(legs[1]).toContain('Line r2');
  });

  it('marks an abandoned trip as an alert', () => {
    const o = byId(explainTrip(trip({ end: 'abandoned', strandedMin: 45 }), names), 'outcome')!;
    expect(o.tone).toBe('alert');
    expect(o.text).toContain('45 min');
  });

  it('marks a trip that was stranded and still arrived as worth a look', () => {
    const t = explainTrip(trip({ strandedMin: 12 }), names);
    expect(byId(t, 'stranded')!.tone).toBe('watch');
    expect(byId(t, 'outcome')!.text).toContain('Arrived');
  });

  it('describes a trip that is still under way', () => {
    const o = byId(explainTrip(trip({ end: 'active', state: 'ON_VEHICLE' }), names), 'outcome')!;
    expect(o.text).toContain('on vehicle');
  });

  it('says nothing about a fare that was not paid', () => {
    expect(byId(explainTrip(trip({ farePaid: 0 }), names), 'fare')).toBeUndefined();
    expect(byId(explainTrip(trip({ farePaid: 3 }), names), 'fare')!.text).toContain('3 OCU');
  });
});

describe('recent trips ring', () => {
  it('keeps the newest RECENT_TRIPS in order', () => {
    const ring: TripRecord[] = [];
    for (let i = 1; i <= RECENT_TRIPS + 50; i++) pushTrip(ring, trip({ id: i }));
    expect(ring).toHaveLength(RECENT_TRIPS);
    expect(ring[0].id).toBe(51);
    expect(ring[ring.length - 1].id).toBe(RECENT_TRIPS + 50);
  });
});
