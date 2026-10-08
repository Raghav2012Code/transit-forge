import type { ReactNode } from 'react';
import type { CityProblem } from '../../simulation/planning/problems.ts';
import type { TransportRoute } from '../../types/index.ts';
import Dock from '../shell/Dock.tsx';
import { RouteRef } from '../shell/RouteBullet.tsx';
import TripList from '../inspectors/TripList.tsx';
import type { TripKind, TripRow } from '../inspectors/trips.ts';

interface Props {
  routes: TransportRoute[];
  /** Peak headway per route id, in minutes. */
  peakHeadway: Record<string, number>;
  /** Boardings so far today, per route id. */
  boardings: Record<string, number>;
  problems: CityProblem[];
  onSelectRoute: (id: string) => void;
  onLocateProblem: (p: CityProblem) => void;
  /** The network-wide fares panel. */
  fares: ReactNode;
  /** Fork and compare the day. */
  timeMachine: ReactNode;
  /** The last finished trips, newest first. */
  recentTrips: TripRow[];
  onOpenTrip: (id: number, kind: TripKind) => void;
}

/**
 * What the side panel shows when nothing is selected in Simulate: where to
 * look. Lines lead to their service plans, problems lead to the map, and the
 * one network-wide lever (fares) sits last.
 */
export default function SimulateHome({ routes, peakHeadway, boardings, problems, onSelectRoute, onLocateProblem, fares, timeMachine, recentTrips, onOpenTrip }: Props) {
  const top = problems.slice(0, 5);
  return (
    <div className="tf-home">
      <section className="tf-home-intro">
        <h3>City</h3>
        <p className="tf-hint">
          Click a station, line, vehicle or district to see it here. Drag to orbit, right-drag to pan, scroll to zoom.
        </p>
      </section>

      {timeMachine}

      <Dock title="Lines" meta={String(routes.length)}>
        <ul className="tf-line-list">
          {routes.map((r) => (
            <li key={r.id} className="tf-line-row">
              <RouteRef route={r} onClick={() => onSelectRoute(r.id)} />
              <span className="tf-line-meta">
                every {peakHeadway[r.id] ?? r.headwayMin} min, {Math.round(boardings[r.id] ?? 0).toLocaleString()} boarded
              </span>
            </li>
          ))}
        </ul>
        <p className="tf-hint">Pick a line to change how often it runs.</p>
      </Dock>

      <Dock title="Needs attention" meta={top.length > 0 ? String(top.length) : undefined}>
        {top.length === 0 ? (
          <p className="tf-hint">Nothing stands out yet. Run the day and check back.</p>
        ) : (
          <ul className="tf-problem-list">
            {top.map((p) => (
              <li key={p.id}>
                <button type="button" className="tf-problem" onClick={() => onLocateProblem(p)}>
                  <span className={`tf-problem-sev ${p.severity >= 70 ? 'high' : 'mid'}`} aria-hidden="true" />
                  <span className="tf-sr-only">{p.severity >= 70 ? 'Severe: ' : 'Watch: '}</span>
                  <span>{p.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Dock>

      {fares}

      <Dock title="Recent trips" meta={recentTrips.length > 0 ? String(recentTrips.length) : undefined} defaultOpen={false}>
        <TripList rows={recentTrips} onOpen={onOpenTrip} empty="No trip has finished yet. Run the day and check back." />
        <p className="tf-hint">Pick a trip to see why it happened.</p>
      </Dock>
    </div>
  );
}
