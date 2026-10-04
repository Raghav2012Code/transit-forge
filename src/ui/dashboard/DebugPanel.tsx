import { useState } from 'react';
import { formatClock, type SimulationState } from '../../simulation/index.ts';

/** Dev-only live internals: passenger counts, clock, per-route utilization. */
export default function DebugPanel({ sim }: { sim: SimulationState }) {
  const [open, setOpen] = useState(false);
  const byState: Record<string, number> = {};
  for (const p of sim.passengers) byState[p.state] = (byState[p.state] ?? 0) + 1;
  return (
    <div className="tf-debug">
      <button type="button" className="tf-btn small" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide debug' : 'Show debug'}
      </button>
      {open && (
        <dl>
          <div className="tf-stat-row"><dt>sim minute</dt><dd>{Math.floor(sim.timeMinutes)} ({formatClock(sim.timeMinutes)})</dd></div>
          <div className="tf-stat-row"><dt>active</dt><dd>{sim.passengers.length}</dd></div>
          <div className="tf-stat-row"><dt>walking</dt><dd>{byState.WALKING ?? 0}</dd></div>
          <div className="tf-stat-row"><dt>waiting</dt><dd>{byState.WAITING ?? 0}</dd></div>
          <div className="tf-stat-row"><dt>transferring</dt><dd>{byState.TRANSFERRING ?? 0}</dd></div>
          <div className="tf-stat-row"><dt>onboard</dt><dd>{byState.ON_VEHICLE ?? 0}</dd></div>
          <div className="tf-stat-row"><dt>generated</dt><dd>{sim.counters.generated}</dd></div>
          <div className="tf-stat-row"><dt>completed</dt><dd>{sim.counters.completed}</dd></div>
          <div className="tf-stat-row"><dt>unrouted</dt><dd>{sim.counters.unrouted}</dd></div>
          <div className="tf-stat-row"><dt>skippedCap</dt><dd>{sim.counters.skippedCap}</dd></div>
          <div className="tf-stat-row"><dt>car trips</dt><dd>{sim.roadCounters.generated}</dd></div>
          <div className="tf-stat-row"><dt>car done</dt><dd>{sim.roadCounters.completed}</dd></div>
          <div className="tf-stat-row"><dt>cars active</dt><dd>{sim.cars.length}</dd></div>
          <div className="tf-stat-row"><dt>maxVC</dt><dd>{Math.round(sim.roadCounters.maxVC * 100) / 100} ({sim.roadCounters.maxVCEdge})</dd></div>
          <div className="tf-stat-row"><dt>bus delay min</dt><dd>{Math.round(sim.roadCounters.busDelayMin)}</dd></div>
          {sim.routes.map((r) => (
            <div key={r.id} className="tf-stat-row">
              <dt>{r.id}</dt>
              <dd>{Math.round(sim.counters.routeBoardings[r.id] ?? 0)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
