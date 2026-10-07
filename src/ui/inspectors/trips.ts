// Trip lists for the inspector. Pure: simulation state in, rows out. Runs on selection and on the
// panel's slow refresh, never per frame.
import type { SimulationState } from '../../simulation/index.ts';
import { formatClock } from '../../simulation/index.ts';
import type { TripNames } from '../../simulation/passengers/explainTrip.ts';
import { recordOfCar, recordOfPassenger } from '../../simulation/passengers/tripRecord.ts';
import type { TripRecord } from '../../types/index.ts';

export type TripKind = 'transit' | 'car';

export interface TripRow {
  id: number;
  kind: TripKind;
  label: string;
  hint: string;
  /** neutral = nothing wrong, watch = delayed, alert = stranded or abandoned. */
  tone: 'neutral' | 'watch' | 'alert';
}

/** Rows shown before "+N more". */
export const MAX_TRIP_ROWS = 30;

export function tripNames(sim: SimulationState): TripNames {
  const zones = new Map(sim.city.zones.map((z) => [z.id, z.name]));
  const stations = new Map(sim.stations.map((s) => [s.id, s.name]));
  const routes = new Map(sim.routes.map((r) => [r.id, r.name]));
  return {
    zone: (id) => zones.get(id) ?? id,
    station: (id) => stations.get(id) ?? id,
    route: (id) => routes.get(id) ?? id,
    clock: formatClock,
  };
}

function rowOf(rec: TripRecord, names: TripNames): TripRow {
  const label = `${names.zone(rec.originZone)} to ${names.zone(rec.destZone)}`;
  let hint: string;
  let tone: TripRow['tone'] = 'neutral';
  if (rec.end === 'abandoned') {
    hint = 'gave up';
    tone = 'alert';
  } else if (rec.end === 'arrived') {
    hint = `${Math.round(rec.travelMin)} min`;
  } else if (rec.state === 'STRANDED') {
    hint = `stranded ${Math.round(rec.strandedMin)} min`;
    tone = 'alert';
  } else if (rec.kind === 'car') {
    hint = 'driving';
  } else {
    hint = rec.state === 'WAITING' ? `waiting ${Math.round(rec.waitMin)} min` : rec.state.toLowerCase().replace('_', ' ');
    if (rec.waitMin >= 10) tone = 'watch';
  }
  return { id: rec.id, kind: rec.kind, label, hint, tone };
}

const severity = (r: TripRow) => (r.tone === 'alert' ? 0 : r.tone === 'watch' ? 1 : 2);

/** Who is aboard a vehicle. */
export function ridersOf(sim: SimulationState, vehicleId: string): TripRow[] {
  const vehicle = sim.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) return [];
  const aboard = new Set(vehicle.riders);
  const names = tripNames(sim);
  return sim.passengers
    .filter((p) => aboard.has(p.id))
    .map((p) => rowOf(recordOfPassenger(p, sim.timeMinutes), names));
}

/** Who is on a platform: the stranded first, then the longest waits. */
export function waitingAt(sim: SimulationState, stationId: string): TripRow[] {
  const names = tripNames(sim);
  return sim.passengers
    .filter((p) => p.atStation === stationId && (p.state === 'WAITING' || p.state === 'STRANDED'))
    .sort((a, b) => b.waitMin - a.waitMin || a.id - b.id)
    .map((p) => rowOf(recordOfPassenger(p, sim.timeMinutes), names))
    .sort((a, b) => severity(a) - severity(b));
}

/** The last finished trips, newest first. */
export function recentRows(sim: SimulationState): TripRow[] {
  const names = tripNames(sim);
  return [...sim.recentTrips].reverse().map((r) => rowOf(r, names));
}

/** A trip by id: live first, then the memory of finished trips. Null once it has aged out. */
export function findTrip(sim: SimulationState, id: number, kind: TripKind): TripRecord | null {
  if (kind === 'transit') {
    const p = sim.passengers.find((x) => x.id === id);
    if (p) return recordOfPassenger(p, sim.timeMinutes);
  } else {
    const c = sim.cars.find((x) => x.id === id);
    if (c) return recordOfCar(c, sim.timeMinutes);
  }
  return sim.recentTrips.find((r) => r.id === id && r.kind === kind) ?? null;
}
