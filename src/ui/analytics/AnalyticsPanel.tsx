import { useMemo, useState } from 'react';
import type { Selection } from '../../rendering/SceneView.tsx';
import type { AccessibilitySet } from '../../simulation/analytics/accessibility.ts';
import type { Bottleneck } from '../../simulation/analytics/bottlenecks.ts';
import type { CoverageSet } from '../../simulation/analytics/coverage.ts';
import type { GapCandidate } from '../../simulation/analytics/gaps.ts';
import type { PlanningScore } from '../../simulation/analytics/impact.ts';
import type { UtilizationRows } from '../../simulation/analytics/utilization.ts';
import { classifyNetwork } from '../../simulation/service/classify.ts';
import type { SimulationState } from '../../simulation/index.ts';
import Dock from '../shell/Dock.tsx';
import { RouteRef } from '../shell/RouteBullet.tsx';

interface Props {
  access: AccessibilitySet;
  coverage: CoverageSet;
  score: PlanningScore;
  bottlenecks: { stations: Bottleneck[]; routes: Bottleneck[]; roads: Bottleneck[] };
  gaps: GapCandidate[];
  utilization: UtilizationRows;
  sim: SimulationState;
  onSelect: (sel: Selection) => void;
}

function BottleneckList({ items, onSelect }: { items: Bottleneck[]; onSelect: (sel: Selection) => void }) {
  if (items.length === 0) return <p className="tf-hint">None congested.</p>;
  return (
    <ol className="tf-ranked">
      {items.map((b) => (
        <li key={`${b.kind}-${b.id}`}>
          <button type="button" className="tf-link" onClick={() => onSelect({ kind: b.kind, id: b.id })}>
            {b.label}
          </button>
          <span className="tf-hint"> {b.value} {b.metric}</span>
          <div className="tf-hint">{b.detail}</div>
        </li>
      ))}
    </ol>
  );
}

export default function AnalyticsPanel({ access, coverage, score, bottlenecks, gaps, utilization, sim, onSelect }: Props) {
  const [routeSort, setRouteSort] = useState<'boardings' | 'occupancy'>('boardings');
  const routes = [...utilization.routes].sort((a, b) =>
    routeSort === 'boardings' ? b.boardings - a.boardings : b.peakOcc - a.peakOcc,
  );
  const problems = useMemo(
    () => classifyNetwork({
      stations: sim.stations,
      routes: sim.routes,
      counters: sim.counters,
      plans: sim.service,
      busSlowdown: sim.busRouteCongestion,
    }),
    [sim],
  );
  const routeById = useMemo(() => new Map(sim.routes.map((r) => [r.id, r])), [sim.routes]);
  const badRoutes = sim.routes.filter((r) => problems.routes[r.id] && problems.routes[r.id] !== 'balanced');
  const badStations = sim.stations.filter((s) => problems.stations[s.id] && problems.stations[s.id] !== 'balanced');
  return (
    <Dock title="Analytics" meta={`score ${score.total}`}>
      <div className="tf-stat-row"><dt>Access score</dt><dd>{access.cityScore}</dd></div>
      <div className="tf-stat-row"><dt>Coverage ({coverage.thresholdM}m)</dt><dd>{coverage.pct}% ({coverage.coveredPop.toLocaleString()})</dd></div>
      <div className="tf-stat-row"><dt>Metro/rail/bus pop</dt><dd>{coverage.metroPop.toLocaleString()}/{coverage.railPop.toLocaleString()}/{coverage.busPop.toLocaleString()}</dd></div>
      <div className="tf-stat-row"><dt>Planning score</dt><dd>{score.total}</dd></div>
      <ul className="tf-score-parts">
        {score.parts.map((p) => (
          <li key={p.label}>{p.label} {p.value} × {Math.round(p.weight * 100)}%</li>
        ))}
      </ul>

      <h4>Top bottlenecks</h4>
      <h5>Stations</h5>
      <BottleneckList items={bottlenecks.stations.slice(0, 3)} onSelect={onSelect} />
      <h5>Routes</h5>
      <BottleneckList items={bottlenecks.routes.slice(0, 3)} onSelect={onSelect} />
      <h5>Roads</h5>
      <BottleneckList items={bottlenecks.roads.slice(0, 3)} onSelect={onSelect} />

      <h4>Service vs demand</h4>
      {badRoutes.length === 0 && badStations.length === 0 ? (
        <p className="tf-hint">All balanced.</p>
      ) : (
        <>
          {badRoutes.map((r) => (
            <div className="tf-stat-row" key={r.id}>
              <dt><RouteRef route={r} onClick={() => onSelect({ kind: 'route', id: r.id })} /></dt>
              <dd>{problems.routes[r.id]}</dd>
            </div>
          ))}
          {badStations.slice(0, 4).map((s) => (
            <div className="tf-stat-row" key={s.id}>
              <dt><button type="button" className="tf-link" onClick={() => onSelect({ kind: 'station', id: s.id })}>{s.name}</button></dt>
              <dd>{problems.stations[s.id]}</dd>
            </div>
          ))}
        </>
      )}

      <h4>Find transit gaps</h4>
      {gaps.length === 0 ? (
        <p className="tf-hint">No significant gaps.</p>
      ) : (
        <ol className="tf-ranked">
          {gaps.slice(0, 5).map((g, i) => (
            <li key={`${g.x}-${g.z}-${i}`}>
              {g.zoneName} <span className="tf-hint">({g.x}, {g.z})</span>
              <div className="tf-hint">
                {g.population.toLocaleString()} residents, {g.nearestStationM}m to a station, CBD {g.cbdMin === null ? 'unreachable' : `${Math.round(g.cbdMin)} min away`}
              </div>
              <div className="tf-hint">{g.reasons.join(', ')}</div>
            </li>
          ))}
        </ol>
      )}

      <h4>
        Routes{' '}
        <button type="button" className="tf-btn small" onClick={() => setRouteSort((s) => (s === 'boardings' ? 'occupancy' : 'boardings'))}>
          by {routeSort === 'boardings' ? 'occupancy' : 'boardings'}
        </button>
      </h4>
      <table className="tf-compare-table">
        <thead><tr><th>Route</th><th>Board</th><th>PkOcc</th><th>Delay</th></tr></thead>
        <tbody>
          {routes.map((r) => (
            <tr key={r.id}>
              <td>
                <RouteRef
                  route={routeById.get(r.id) ?? { id: r.id, name: r.name, color: '#6b7280' }}
                  onClick={() => onSelect({ kind: 'route', id: r.id })}
                />
              </td>
              <td>{r.boardings.toLocaleString()}</td>
              <td>{r.peakOcc}%</td>
              <td>{r.delayPct}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>Stations</h4>
      <table className="tf-compare-table">
        <thead><tr><th>Station</th><th>Board</th><th>Wait</th><th>Xfer</th><th>Util</th></tr></thead>
        <tbody>
          {utilization.stations.slice(0, 6).map((s) => (
            <tr key={s.id}>
              <td><button type="button" className="tf-link" onClick={() => onSelect({ kind: 'station', id: s.id })}>{s.name}</button></td>
              <td>{s.boarded.toLocaleString()}</td>
              <td>{s.waiting.toLocaleString()}</td>
              <td>{s.transfers.toLocaleString()}</td>
              <td>{s.util}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>Roads</h4>
      <table className="tf-compare-table">
        <thead><tr><th>Road</th><th>V/C</th><th>Delay</th></tr></thead>
        <tbody>
          {utilization.roads.slice(0, 6).map((r) => (
            <tr key={r.id}>
              <td><button type="button" className="tf-link" onClick={() => onSelect({ kind: 'road', id: r.id })}>{r.label}</button></td>
              <td>{r.vc}</td>
              <td>+{r.delayMin} min</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dock>
  );
}
