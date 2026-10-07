import type { CarTrip, Passenger, TripRecord } from '../../types/index.ts';

/** The inspector remembers this many finished trips. Bounded, written once per trip. */
export const RECENT_TRIPS = 200;

export function pushTrip(ring: TripRecord[], rec: TripRecord): void {
  ring.push(rec);
  if (ring.length > RECENT_TRIPS) ring.splice(0, ring.length - RECENT_TRIPS);
}

export function recordOfPassenger(p: Passenger, nowMin: number): TripRecord {
  // A trip is abandoned only by 45 minutes stranded; replanning resets strandedMin, so this is exact.
  const end = p.state !== 'ARRIVED' ? 'active' : p.strandedMin >= 45 ? 'abandoned' : 'arrived';
  return {
    id: p.id,
    kind: 'transit',
    originZone: p.originZone,
    destZone: p.destZone,
    purpose: p.purpose,
    departMin: p.departMin,
    endMin: p.arriveMin ?? nowMin,
    end,
    state: p.state,
    decision: p.decision,
    legs: p.legs,
    waitMin: p.waitMin,
    travelMin: p.travelMin,
    transfers: p.transfers,
    strandedMin: p.strandedMin,
    farePaid: p.farePaid,
  };
}

export function recordOfCar(c: CarTrip, nowMin: number): TripRecord {
  // The traffic step drops a car held longer than 120 ticks with nowhere to go.
  const end = c.state !== 'DONE' ? 'active' : c.heldTicks > 120 ? 'abandoned' : 'arrived';
  return {
    id: c.id,
    kind: 'car',
    originZone: c.originZone,
    destZone: c.destZone,
    purpose: c.purpose,
    departMin: c.departMin,
    endMin: c.arriveMin ?? nowMin,
    end,
    state: c.state,
    decision: c.decision,
    legs: [],
    waitMin: 0,
    travelMin: c.travelMin,
    transfers: 0,
    strandedMin: 0,
    farePaid: 0,
  };
}
