import type { Selection } from '../../rendering/SceneView.tsx';
import type { SimulationState } from '../../simulation/index.ts';

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
        </dl>
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
