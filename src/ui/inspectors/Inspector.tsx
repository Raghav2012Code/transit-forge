import type { Selection } from '../../rendering/SceneView.tsx';
import type { SimulationState } from '../../simulation/index.ts';
import { formatClock } from '../../simulation/index.ts';
import { stationCatchment } from '../../simulation/analytics/catchment.ts';
import { LOOP_ROUTES } from '../../simulation/passengers/passengers.ts';
import { nextArrivalMin, nextTerminusDeparture, routeEffectiveHeadway } from '../../simulation/service/timetable.ts';

/** Upcoming departures at a station, per serving route and direction. */
function StationDepartures({ sim, stationId }: { sim: SimulationState; stationId: string }) {
  const rows: { route: string; label: string; time: string }[] = [];
  for (const r of sim.routes) {
    const idx = r.stationIds.indexOf(stationId);
    if (idx < 0) continue;
    const plan = sim.service[r.id];
    if (!plan) continue;
    const cum = sim.routeCumDist.get(r.id) ?? [0];
    const total = Math.max(1, cum[cum.length - 1]);
    const slow = r.mode === 'bus' ? (sim.busRouteCongestion[r.id] ?? 1) : 1;
    const h = routeEffectiveHeadway(plan, total, r.stationIds.length, slow, sim.timeMinutes, LOOP_ROUTES.has(r.id));
    if (!Number.isFinite(h)) continue;
    const offset = sim.serviceOffsets[r.id] ?? 0;
    const first = sim.stations.find((s) => s.id === r.stationIds[0])?.name ?? '?';
    const last = sim.stations.find((s) => s.id === r.stationIds[r.stationIds.length - 1])?.name ?? '?';
    const fromStart = travelTo(cum[idx] ?? 0, plan.speedKph);
    const fromEnd = travelTo(total - (cum[idx] ?? 0), plan.speedKph);
    const a = nextTerminusDeparture(plan, h, offset, sim.timeMinutes - fromStart) + fromStart;
    const b = nextTerminusDeparture(plan, h, offset, sim.timeMinutes - fromEnd) + fromEnd;
    const next = Math.min(a, b);
    if (!Number.isFinite(next)) continue;
    rows.push({
      route: r.name,
      label: next === a ? `toward ${last}` : `toward ${first}`,
      time: formatClock(next),
    });
  }
  if (rows.length === 0) return null;
  return (
    <>
      <p className="tf-hint">Next departures</p>
      <dl>
        {rows.map((d, i) => (
          <div className="tf-stat-row" key={i}><dt>{d.route} {d.label}</dt><dd>{d.time}</dd></div>
        ))}
      </dl>
    </>
  );
}

function travelTo(distM: number, speedKph: number): number {
  return (distM / 1000 / Math.max(1, speedKph)) * 60;
}
function nextDepartures(sim: SimulationState, routeId: string, count: number): { label: string; time: string; from: string }[] {
  const route = sim.routes.find((r) => r.id === routeId);
  const plan = sim.service[routeId];
  if (!route || !plan || route.stationIds.length < 2) return [];
  const cum = sim.routeCumDist.get(routeId) ?? [0];
  const total = Math.max(1, cum[cum.length - 1]);
  const slow = route.mode === 'bus' ? (sim.busRouteCongestion[routeId] ?? 1) : 1;
  const h = routeEffectiveHeadway(plan, total, route.stationIds.length, slow, sim.timeMinutes, LOOP_ROUTES.has(routeId));
  if (!Number.isFinite(h)) return [];
  const offset = sim.serviceOffsets[routeId] ?? 0;
  const first = sim.stations.find((s) => s.id === route.stationIds[0]);
  const last = sim.stations.find((s) => s.id === route.stationIds[route.stationIds.length - 1]);
  const out: { label: string; time: string; from: string }[] = [];
  let t = nextArrivalMin(plan, h, offset, cum, 0, sim.timeMinutes);
  for (let i = 0; i < count && Number.isFinite(t); i++) {
    out.push({ label: `toward ${last?.name ?? '?'}`, time: formatClock(t), from: first?.name ?? '?' });
    t = nextArrivalMin(plan, h, offset, cum, 0, t + 0.5);
  }
  return out;
}

interface Props {
  selection: Selection | null;
  sim: SimulationState;
  onClose: () => void;
}

export default function Inspector({ selection, sim, onClose }: Props) {
  if (!selection) {
    return (
      <div className="tf-inspector">
        <h3>Inspector</h3>
        <p className="tf-hint">Click a station, route, or district in the 3D view.</p>
      </div>
    );
  }

  if (selection.kind === 'station') {
    const st = sim.stations.find((s) => s.id === selection.id);
    if (!st) return null;
    const routes = sim.routes.filter((r) => st.routeIds.includes(r.id));
    const interchange = st.routeIds.length > 1;
    const catchment = stationCatchment(st, sim.city.zones, 800);
    return (
      <div className="tf-inspector">
        <div className="tf-inspector-head">
          <h3>{st.name}</h3>
          <button type="button" className="tf-btn small" onClick={onClose}>×</button>
        </div>
        <p className="tf-hint">{interchange ? 'Interchange station' : 'Station'}</p>
        <dl>
          <div className="tf-stat-row"><dt>Modes</dt><dd>{st.modes.join(', ')}</dd></div>
          <div className="tf-stat-row"><dt>Routes</dt><dd>{routes.map((r) => r.name).join(' · ')}</dd></div>
          <div className="tf-stat-row"><dt>Capacity</dt><dd>{st.capacityPerHr.toLocaleString()}/hr</dd></div>
          <div className="tf-stat-row"><dt>Waiting now</dt><dd>{Math.round(st.waiting).toLocaleString()}</dd></div>
          <div className="tf-stat-row"><dt>Peak waiting</dt><dd>{Math.round(st.peakWaiting).toLocaleString()}</dd></div>
          <div className="tf-stat-row"><dt>Boarded</dt><dd>{Math.round(st.boardedDay).toLocaleString()}</dd></div>
          <div className="tf-stat-row"><dt>Alighted</dt><dd>{Math.round(st.alightedDay).toLocaleString()}</dd></div>
          <div className="tf-stat-row"><dt>Transfers</dt><dd>{Math.round(st.transfersDay).toLocaleString()}</dd></div>
        </dl>
        <p className="tf-hint">Catchment (800m)</p>
        <dl>
          <div className="tf-stat-row"><dt>Population</dt><dd>{catchment.population.toLocaleString()}</dd></div>
          <div className="tf-stat-row"><dt>Employment</dt><dd>{catchment.jobs.toLocaleString()}</dd></div>
          <div className="tf-stat-row"><dt>Utilization</dt><dd>{Math.round(catchment.utilization01 * 100)}%</dd></div>
        </dl>
        <StationDepartures sim={sim} stationId={st.id} />
      </div>
    );
  }

  if (selection.kind === 'route') {
    const r = sim.routes.find((x) => x.id === selection.id);
    if (!r) return null;
    const vehicles = sim.vehicles.filter((vv) => vv.routeId === r.id);
    const boardings = sim.counters.routeBoardings[r.id] ?? 0;
    const onboard = vehicles.reduce((s, vv) => s + vv.riders.length, 0);
    const cap = vehicles.reduce((s, vv) => s + vv.capacity, 0);
    const occ = cap > 0 ? Math.round((onboard / cap) * 1000) / 10 : 0;
    const plan = sim.service[r.id];
    const denied = sim.counters.routeDenied[r.id] ?? 0;
    const peakOcc = Math.round((sim.counters.routePeakOcc[r.id] ?? 0) * 1000) / 10;
    const departures = plan ? nextDepartures(sim, r.id, 4) : [];
    return (
      <div className="tf-inspector">
        <div className="tf-inspector-head">
          <h3>{r.name}</h3>
          <button type="button" className="tf-btn small" onClick={onClose}>×</button>
        </div>
        <p className="tf-hint">{r.mode} · {r.stationIds.length} stations</p>
        <dl>
          <div className="tf-stat-row"><dt>Headway</dt><dd>{r.headwayMin} min</dd></div>
          <div className="tf-stat-row"><dt>Speed</dt><dd>{r.speedKph} kph</dd></div>
          <div className="tf-stat-row"><dt>Vehicles</dt><dd>{vehicles.length}</dd></div>
          <div className="tf-stat-row"><dt>Veh. cap</dt><dd>{r.vehicleCapacity}</dd></div>
          <div className="tf-stat-row"><dt>Boardings</dt><dd>{Math.round(boardings).toLocaleString()}</dd></div>
          <div className="tf-stat-row"><dt>Onboard now</dt><dd>{onboard} / {cap} ({occ}%)</dd></div>
        </dl>
        {plan && (
          <>
            <p className="tf-hint">Service (peak {plan.peakHeadwayMin}m / off-peak {plan.offPeakHeadwayMin}m)</p>
            <dl>
              <div className="tf-stat-row"><dt>Fleet</dt><dd>{plan.fleetSize === 0 ? `auto (${vehicles.length})` : plan.fleetSize}</dd></div>
              <div className="tf-stat-row"><dt>Peak occupancy</dt><dd>{peakOcc}%</dd></div>
              <div className="tf-stat-row"><dt>Denied</dt><dd>{Math.round(denied).toLocaleString()}</dd></div>
              <div className="tf-stat-row"><dt>Delay total</dt><dd>{Math.round(sim.counters.totalDelayMin)} min</dd></div>
            </dl>
          </>
        )}
        {departures.length > 0 && (
          <>
            <p className="tf-hint">Next from {departures[0].from}</p>
            <dl>
              {departures.map((d, i) => (
                <div className="tf-stat-row" key={i}><dt>{d.label}</dt><dd>{d.time}</dd></div>
              ))}
            </dl>
          </>
        )}
      </div>
    );
  }

  const z = sim.city.zones.find((zz) => zz.id === selection.id);
  if (z) {
    return (
      <div className="tf-inspector">
        <div className="tf-inspector-head">
          <h3>{z.name}</h3>
          <button type="button" className="tf-btn small" onClick={onClose}>×</button>
        </div>
        <p className="tf-hint">{z.kind}</p>
        <dl>
          <div className="tf-stat-row"><dt>Population</dt><dd>{z.population.toLocaleString()}</dd></div>
          <div className="tf-stat-row"><dt>Employment</dt><dd>{z.jobs.toLocaleString()}</dd></div>
          <div className="tf-stat-row"><dt>Students</dt><dd>{z.students.toLocaleString()}</dd></div>
          <div className="tf-stat-row"><dt>Households</dt><dd>{z.households.toLocaleString()}</dd></div>
          <div className="tf-stat-row"><dt>Development</dt><dd>{Math.round(z.developed01 * 100)}%</dd></div>
          <div className="tf-stat-row"><dt>Capacity</dt><dd>{z.capacityPop.toLocaleString()} pop / {z.capacityJobs.toLocaleString()} jobs</dd></div>
          <div className="tf-stat-row"><dt>Accessibility</dt><dd>{z.accessScore.toFixed(0)}/100</dd></div>
          <div className="tf-stat-row"><dt>Attractiveness</dt><dd>{z.attractiveness.toFixed(0)}/100</dd></div>
          <div className="tf-stat-row"><dt>Pop. growth</dt><dd>{(z.popGrowthRate * 100).toFixed(1)}%/yr</dd></div>
          <div className="tf-stat-row"><dt>Job growth</dt><dd>{(z.jobGrowthRate * 100).toFixed(1)}%/yr</dd></div>
        </dl>
      </div>
    );
  }

  if (selection.kind === 'road') {
    const edge = sim.city.roadEdges.find((e) => e.id === selection.id);
    const st = sim.edgeState[selection.id];
    if (!edge || !st) return null;
    const free = sim.roadGraph.freeMin.get(edge.id) ?? 0;
    const cap = sim.roadGraph.capacityPerHr.get(edge.id) ?? 0;
    return (
      <div className="tf-inspector">
        <div className="tf-inspector-head">
          <h3>{edge.isBridge ? 'Bridge' : edge.isArterial ? 'Arterial' : 'Local'} {edge.a.replace(/^rn-/, '').toUpperCase()}–{edge.b.replace(/^rn-/, '').toUpperCase()}</h3>
          <button type="button" className="tf-btn small" onClick={onClose}>×</button>
        </div>
        <p className="tf-hint">{st.level} · {edge.lanes} lanes{edge.isBridge ? ' · bridge' : ''}</p>
        <dl>
          <div className="tf-stat-row"><dt>Length</dt><dd>{Math.round(edge.lengthM)} m</dd></div>
          <div className="tf-stat-row"><dt>Capacity</dt><dd>{cap.toLocaleString()}/hr</dd></div>
          <div className="tf-stat-row"><dt>Cars on road</dt><dd>{st.load}</dd></div>
          <div className="tf-stat-row"><dt>V/C ratio</dt><dd>{Math.round(st.vc * 100) / 100}</dd></div>
          <div className="tf-stat-row"><dt>Free-flow time</dt><dd>{Math.round(free * 100) / 100} min</dd></div>
          <div className="tf-stat-row"><dt>Current time</dt><dd>{Math.round(st.currentMin * 100) / 100} min</dd></div>
          <div className="tf-stat-row"><dt>Level</dt><dd>{st.level}</dd></div>
        </dl>
      </div>
    );
  }

  return null;
}
