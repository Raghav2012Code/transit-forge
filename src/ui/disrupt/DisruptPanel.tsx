import type { Selection } from '../../rendering/SceneView.tsx';
import type { SimulationState } from '../../simulation/index.ts';
import { formatClock } from '../../simulation/index.ts';
import type { Incident, IncidentKind } from '../../types/index.ts';
import type { IncidentDraft } from './draft.ts';
import type { IncidentPreset } from '../../simulation/incidents/incidents.ts';
import { edgeName } from '../../simulation/traffic/roadGraph.ts';
import type { CompareRow } from '../../simulation/scenario/compare.ts';
import type { CriticalItem } from '../../simulation/analytics/resilience.ts';

const KINDS: { key: IncidentKind; label: string }[] = [
  { key: 'segment-closure', label: 'Close segment' },
  { key: 'station-closure', label: 'Close station' },
  { key: 'route-suspension', label: 'Suspend route' },
  { key: 'reduced-service', label: 'Reduce service' },
  { key: 'major-delay', label: 'Major delay' },
  { key: 'road-closure', label: 'Close road' },
  { key: 'road-capacity', label: 'Cut road capacity' },
  { key: 'bridge-closure', label: 'Close bridge' },
];

interface Props {
  sim: SimulationState;
  draft: IncidentDraft;
  onDraft: (d: IncidentDraft) => void;
  onCreate: () => void;
  onUseSelection: () => void;
  selection: Selection | null;
  incidents: Incident[];
  selectedIncidentId: string | null;
  onSelectIncident: (id: string | null) => void;
  onResolve: (id: string) => void;
  onDeployReplacement: (id: string) => void;
  onBoostFrequency: (routeId: string) => void;
  presets: IncidentPreset[];
  onPreset: (key: string) => void;
  critical: CriticalItem[] | null;
  onAnalyze: () => void;
  resilienceRows: CompareRow[] | null;
  resilienceRunning: boolean;
  onCompareResilience: () => void;
}

function fmt(t: number): string {
  return formatClock(t);
}

export default function DisruptPanel(p: Props) {
  const d = p.draft;
  const set = (patch: Partial<IncidentDraft>) => p.onDraft({ ...d, ...patch });
  const route = p.sim.routes.find((r) => r.id === d.targetRouteId);
  const segStations = route?.stationIds ?? [];
  const edges = [...p.sim.roadGraph.edges].sort((a, b) => (b.isBridge ? 1 : 0) - (a.isBridge ? 1 : 0));
  const activeCount = p.incidents.filter((i) => i.status === 'active').length;

  return (
    <div className="tf-build">
      <h3>Disruptions{activeCount > 0 ? ` (${activeCount} active)` : ''}</h3>
      <div className="tf-tool-grid" role="group" aria-label="Incident type">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            className={`tf-btn small${d.kind === k.key ? ' active' : ''}`}
            onClick={() => set({ kind: k.key })}
          >
            {k.label}
          </button>
        ))}
      </div>
      <p className="tf-hint">Pick infrastructure on the map, or choose below, then create.</p>

      {(d.kind === 'segment-closure' || d.kind === 'route-suspension' || d.kind === 'reduced-service' || d.kind === 'major-delay') && (
        <label className="tf-namelabel">
          Route
          <select value={d.targetRouteId} onChange={(e) => set({ targetRouteId: e.target.value, segFrom: '', segTo: '' })}>
            <option value="">— choose —</option>
            {p.sim.routes.filter((r) => !r.id.startsWith('rt-rep-')).map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
      )}
      {d.kind === 'segment-closure' && route && (
        <div className="tf-draft-actions">
          <label className="tf-namelabel">
            From
            <select value={d.segFrom} onChange={(e) => set({ segFrom: e.target.value })}>
              <option value="">—</option>
              {segStations.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="tf-namelabel">
            To
            <select value={d.segTo} onChange={(e) => set({ segTo: e.target.value })}>
              <option value="">—</option>
              {segStations.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
      )}
      {d.kind === 'station-closure' && (
        <label className="tf-namelabel">
          Station
          <select value={d.targetStationId} onChange={(e) => set({ targetStationId: e.target.value })}>
            <option value="">— choose —</option>
            {p.sim.stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}
      {(d.kind === 'road-closure' || d.kind === 'road-capacity' || d.kind === 'bridge-closure') && (
        <label className="tf-namelabel">
          Road
          <select value={d.edgeId} onChange={(e) => set({ edgeId: e.target.value })}>
            <option value="">— choose —</option>
            {edges.map((e) => <option key={e.id} value={e.id}>{edgeName(e)}</option>)}
          </select>
        </label>
      )}
      {d.kind === 'reduced-service' && (
        <label className="tf-namelabel">
          Headway ×
          <select value={d.headwayMult} onChange={(e) => set({ headwayMult: Number(e.target.value) })}>
            {[1.5, 2, 3, 4].map((m) => <option key={m} value={m}>{m}×</option>)}
          </select>
        </label>
      )}
      {d.kind === 'major-delay' && (
        <label className="tf-namelabel">
          Extra dwell / stop (min)
          <select value={d.delayMin} onChange={(e) => set({ delayMin: Number(e.target.value) })}>
            {[2, 4, 6, 10].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      )}
      {d.kind === 'road-capacity' && (
        <label className="tf-namelabel">
          Remaining capacity
          <select value={d.capacityMult} onChange={(e) => set({ capacityMult: Number(e.target.value) })}>
            {[0.75, 0.5, 0.25].map((m) => <option key={m} value={m}>{Math.round(m * 100)}%</option>)}
          </select>
        </label>
      )}
      <div className="tf-draft-actions">
        <label className="tf-namelabel">
          Starts in (min)
          <input type="number" min={0} max={600} value={d.startInMin} onChange={(e) => set({ startInMin: Math.max(0, Number(e.target.value) || 0) })} />
        </label>
        <label className="tf-namelabel">
          Duration (min)
          <input type="number" min={5} max={600} value={d.durationMin} onChange={(e) => set({ durationMin: Math.max(5, Number(e.target.value) || 45) })} />
        </label>
        <label className="tf-namelabel">
          Severity
          <select value={d.severity} onChange={(e) => set({ severity: e.target.value as IncidentDraft['severity'] })}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
      </div>
      {(d.kind === 'segment-closure' || d.kind === 'route-suspension' || d.kind === 'station-closure') && (
        <label className="tf-check">
          <input type="checkbox" checked={d.withReplacement} onChange={(e) => set({ withReplacement: e.target.checked })} />
          Replacement buses ({p.sim.emergencyBusesFree} free)
        </label>
      )}
      {d.withReplacement && (
        <div className="tf-draft-actions">
          <label className="tf-namelabel">
            Buses
            <input type="number" min={1} max={12} value={d.repBuses} onChange={(e) => set({ repBuses: Math.max(1, Math.min(12, Number(e.target.value) || 4)) })} />
          </label>
          <label className="tf-namelabel">
            Headway
            <input type="number" min={3} max={30} value={d.repHeadwayMin} onChange={(e) => set({ repHeadwayMin: Math.max(3, Number(e.target.value) || 6) })} />
          </label>
        </div>
      )}
      <div className="tf-draft-actions">
        <button type="button" className="tf-btn small" onClick={p.onUseSelection} disabled={!p.selection}>
          Use map selection
        </button>
        <button type="button" className="tf-btn small primary" onClick={p.onCreate}>
          Create incident
        </button>
      </div>

      <h3>Active &amp; scheduled</h3>
      {p.incidents.length === 0 && <p className="tf-hint">No incidents. The network is nominal.</p>}
      {p.incidents.map((inc) => (
        <div key={inc.id} className="tf-draft">
          <div className="tf-inspector-head">
            <button type="button" className="tf-link" onClick={() => p.onSelectIncident(p.selectedIncidentId === inc.id ? null : inc.id)}>
              {inc.status === 'active' ? '⚠ ' : ''}{inc.label}
            </button>
            <span className="tf-hint">{inc.status}</span>
          </div>
          <div className="tf-hint">{fmt(inc.startMin)}–{fmt(inc.startMin + inc.durationMin)} · severity {(inc.severity01 * 100).toFixed(0)}%</div>
          {p.selectedIncidentId === inc.id && (
            <IncidentDetail
              sim={p.sim}
              inc={inc}
              onResolve={() => p.onResolve(inc.id)}
              onDeployReplacement={() => p.onDeployReplacement(inc.id)}
              onBoostFrequency={() => inc.targetRouteId && p.onBoostFrequency(inc.targetRouteId)}
            />
          )}
        </div>
      ))}

      <h3>Presets</h3>
      <div className="tf-draft-actions">
        {p.presets.map((pr) => (
          <button key={pr.key} type="button" className="tf-btn small" onClick={() => p.onPreset(pr.key)} title={pr.hint}>
            {pr.label}
          </button>
        ))}
      </div>

      <h3>Critical links</h3>
      <button type="button" className="tf-btn small" onClick={p.onAnalyze}>Analyze network resilience</button>
      {p.critical && (
        <ol className="tf-ranked">
          {p.critical.map((c) => (
            <li key={`${c.kind}-${c.id}`}>
              {c.label} <span className="tf-hint">· {c.score}</span>
              <div className="tf-hint">{c.reason}</div>
            </li>
          ))}
        </ol>
      )}

      <h3>Resilience vs base</h3>
      <button type="button" className="tf-btn small" disabled={p.resilienceRunning} onClick={p.onCompareResilience}>
        {p.resilienceRunning ? 'Running…' : 'Compare under disruption'}
      </button>
      {p.resilienceRows && (
        <table className="tf-compare-table">
          <tbody>
            {p.resilienceRows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td>{r.base}</td>
                <td>{r.mod}</td>
                <td className={r.better === 'up' && (r.pct ?? 0) > 0 ? 'tf-good' : r.better === 'down' && (r.pct ?? 0) < 0 ? 'tf-good' : ''}>{r.delta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Timeline</h3>
      {p.sim.events.length === 0 && <p className="tf-hint">No events yet.</p>}
      <ol className="tf-ranked">
        {[...p.sim.events].reverse().slice(0, 30).map((e, i) => (
          <li key={`${e.t}-${i}`}>
            <span className="tf-hint">{fmt(e.t)}</span> {e.level === 'warn' ? '⚠ ' : ''}{e.text}
          </li>
        ))}
      </ol>
    </div>
  );
}

function IncidentDetail({ sim, inc, onResolve, onDeployReplacement, onBoostFrequency }: {
  sim: SimulationState;
  inc: Incident;
  onResolve: () => void;
  onDeployReplacement: () => void;
  onBoostFrequency: () => void;
}) {
  const cap = inc.result;
  return (
    <div>
      <div className="tf-stat-row"><dt>Status</dt><dd>{inc.status}</dd></div>
      {inc.result && (
        <>
          <div className="tf-stat-row"><dt>Affected</dt><dd>{inc.result.affectedPax}</dd></div>
          <div className="tf-stat-row"><dt>Rerouted</dt><dd>{inc.result.rerouted}</dd></div>
          <div className="tf-stat-row"><dt>Stranded peak</dt><dd>{inc.result.strandedPeak}</dd></div>
          <div className="tf-stat-row"><dt>Extra wait</dt><dd>{Math.round(inc.result.extraWaitMin)} min</dd></div>
          <div className="tf-stat-row"><dt>Recovery</dt><dd>{inc.result.recoveryTicks} min</dd></div>
        </>
      )}
      {!inc.result && inc.status === 'active' && (
        <div className="tf-stat-row"><dt>Waiting baseline</dt><dd>{Math.round(inc.baselineWaiting)}</dd></div>
      )}
      {inc.replacement && !inc.replacementRouteId && (inc.status === 'scheduled' || inc.status === 'active') && (
        <button type="button" className="tf-btn small" onClick={onDeployReplacement}>
          Deploy replacement ({sim.emergencyBusesFree} free)
        </button>
      )}
      {inc.replacementRouteId && <div className="tf-hint">Replacement running: {inc.replacementRouteId}</div>}
      {inc.targetRouteId && !inc.targetRouteId.startsWith('rt-rep-') && (
        <button type="button" className="tf-btn small" onClick={onBoostFrequency}>
          Boost parallel frequency
        </button>
      )}
      {(inc.status === 'active' || inc.status === 'scheduled') && (
        <button type="button" className="tf-btn small" onClick={onResolve}>Resolve now</button>
      )}
      {cap && <div className="tf-hint">Lost: {cap.routeKmLost} route-km · {cap.roadKmLost} road-km</div>}
    </div>
  );
}
