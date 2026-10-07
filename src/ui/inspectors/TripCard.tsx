import { useState } from 'react';
import type { SimulationState } from '../../simulation/index.ts';
import { explainTrip } from '../../simulation/passengers/explainTrip.ts';
import type { TripRecord } from '../../types/index.ts';
import { RouteRef } from '../shell/RouteBullet.tsx';
import { findTrip, tripNames, type TripKind } from './trips.ts';

interface Props {
  sim: SimulationState;
  tripId: number;
  kind: TripKind;
  onBack: () => void;
}

/**
 * One trip, explained: the choice that was made, the rides, and how it ended.
 * At high speed a finished trip ages out of the simulation's short memory in
 * seconds, so the card keeps the last record it saw rather than going blank.
 */
export default function TripCard({ sim, tripId, kind, onBack }: Props) {
  const live = findTrip(sim, tripId, kind);
  // Derived state, adjusted during render: remember the latest live record, and fall back to it once it ages out.
  const sig = live ? `${live.end}|${live.state}|${live.endMin}|${live.waitMin}|${live.strandedMin}|${live.legs.length}` : null;
  const [kept, setKept] = useState<{ sig: string | null; rec: TripRecord | null }>({ sig, rec: live });
  if (sig !== null && sig !== kept.sig) setKept({ sig, rec: live });
  const rec = live ?? kept.rec;
  const names = tripNames(sim);
  const routes = new Map(sim.routes.map((r) => [r.id, r]));
  return (
    <div className="tf-inspector tf-trip-card">
      <div className="tf-inspector-head">
        <h3>{kind === 'car' ? 'Car trip' : 'Transit trip'}</h3>
        <button type="button" className="tf-btn small" onClick={onBack}>Back</button>
      </div>
      {!rec ? (
        <p className="tf-hint">This trip is no longer in memory.</p>
      ) : (
        <ul className="tf-trip-facts">
          {explainTrip(rec, names).map((s) => {
            if (s.id.startsWith('leg-')) {
              const leg = rec.legs[Number(s.id.slice(4))];
              const route = leg ? routes.get(leg.routeId) : undefined;
              if (leg && route) {
                return (
                  <li key={s.id} className="tf-trip-leg">
                    <RouteRef route={route} />
                    <span>from {names.station(leg.board)} to {names.station(leg.alight)}</span>
                  </li>
                );
              }
            }
            return <li key={s.id} className={s.tone === 'neutral' ? undefined : s.tone}>{s.text}</li>;
          })}
        </ul>
      )}
      {rec && !live && <p className="tf-hint">This trip has aged out of the simulation's memory; this is its last record.</p>}
    </div>
  );
}
