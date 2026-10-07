import type { TripRecord } from '../../types/index.ts';

/** Names and the clock are injected: this stays pure and free of the simulation core's imports. */
export interface TripNames {
  zone: (id: string) => string;
  station: (id: string) => string;
  route: (id: string) => string;
  clock: (min: number) => string;
}

export interface TripStatement {
  id: string;
  text: string;
  /** neutral = information, watch = worth a look, alert = something went wrong. */
  tone: 'neutral' | 'watch' | 'alert';
}

const mins = (n: number) => `${Math.round(n)} min`;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Plain statements that say why a trip went the way it did. */
export function explainTrip(t: TripRecord, n: TripNames): TripStatement[] {
  const out: TripStatement[] = [];
  const add = (id: string, text: string, tone: TripStatement['tone'] = 'neutral') => out.push({ id, text, tone });
  const d = t.decision;

  add('trip', `${t.purpose} trip from ${n.zone(t.originZone)} to ${n.zone(t.destZone)}, leaving at ${n.clock(t.departMin)}.`);

  if (d.options === 'both' && d.transitMin !== null && d.roadMin !== null && d.pCar !== null) {
    const pct = Math.round(d.pCar * 100);
    const transfers = `${d.transfers ?? 0} ${plural(d.transfers ?? 0, 'transfer', 'transfers')}`;
    if (d.carFailed) {
      add('choice', `Chose the car (a ${pct}% chance), but the roads had no room for another trip, so took transit: ${mins(d.transitMin)} with ${transfers}.`, 'watch');
    } else if (d.chose === 'transit') {
      add('choice', `Chose transit: ${mins(d.transitMin)} with ${transfers} against ${mins(d.roadMin)} by car, a ${pct}% chance of driving.`);
    } else {
      add('choice', `Chose the car: ${mins(d.roadMin)} against ${mins(d.transitMin)} by transit with ${transfers}, a ${pct}% chance of driving.`);
    }
  } else if (d.options === 'transit-only' && d.transitMin !== null) {
    add('choice', `Transit was the only option: ${mins(d.transitMin)}.`);
  } else if (d.options === 'road-only' && d.roadMin !== null) {
    add('choice', `The road was the only option: ${mins(d.roadMin)} by car.`);
  }

  t.legs.forEach((leg, i) => {
    add(`leg-${i}`, `Ride ${i + 1}: ${n.route(leg.routeId)} from ${n.station(leg.board)} to ${n.station(leg.alight)}.`);
  });

  if (t.strandedMin > 0 && t.end !== 'abandoned') {
    add('stranded', `Was stranded for ${mins(t.strandedMin)} before moving on.`, 'watch');
  }
  if (t.end === 'abandoned') {
    add(
      'outcome',
      t.kind === 'car'
        ? 'Gave up: the road ahead stayed closed and the trip was dropped.'
        : `Gave up after ${mins(t.strandedMin)} stranded and left the network.`,
      'alert',
    );
  } else if (t.end === 'arrived') {
    const waited = t.kind === 'transit' ? `, ${mins(t.waitMin)} of it waiting` : '';
    add('outcome', `Arrived at ${n.clock(t.endMin)} after ${mins(t.travelMin)}${waited}.`);
  } else {
    add('outcome', `Still under way (${t.state.toLowerCase().replace('_', ' ')}) at ${n.clock(t.endMin)}.`);
  }
  if (t.farePaid > 0) add('fare', `Fare locked in at boarding: ${t.farePaid} OCU.`);
  return out;
}
