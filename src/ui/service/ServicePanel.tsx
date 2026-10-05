// Service Planning panel: edit a route's operating plan and see the
// consequences derived from live simulation state (no hard-coded estimates).
import type { SimulationState } from '../../simulation/index.ts';
import type { ServicePatch } from '../../simulation/scenario/scenario.ts';
import { MAX_FARE, type FarePolicy } from '../../simulation/economics/fares.ts';
import { clampHeadway } from '../../simulation/service/servicePlan.ts';
import { effectiveHeadway, fleetRequired } from '../../simulation/service/timetable.ts';
import { routeServiceMath } from '../../simulation/service/routeService.ts';
import { formatClock } from '../../simulation/index.ts';
import Dock from '../shell/Dock.tsx';
import { IconMinus, IconPlus } from '../shell/icons.tsx';

interface Props {
  sim: SimulationState;
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
  onPatch: (routeId: string, patch: ServicePatch) => void;
  onFares: (fares: FarePolicy) => void;
}

const QUICK_HEADWAYS: Record<string, number[]> = {
  metro: [3, 5, 8, 10, 15],
  rail: [5, 10, 15, 30],
  bus: [5, 10, 15, 20, 30],
};

const CAPACITY_OPTIONS: Record<string, number[]> = {
  metro: [400, 800, 1200],
  rail: [600, 900, 1200, 1500],
  bus: [40, 70, 100, 120],
};

const TIME_STEPS: number[] = [];
for (let t = 240; t <= 1440; t += 30) TIME_STEPS.push(t);

function Stepper({ label, value, display, onChange, min, max, step = 1 }: {
  label: string;
  value: number;
  display: string;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <div className="tf-stat-row">
      <dt>{label}</dt>
      <dd className="tf-stepper">
        <button
          type="button"
          className="tf-btn icon"
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - step))}
        >
          <IconMinus />
        </button>
        <output aria-label={label}>{display}</output>
        <button
          type="button"
          className="tf-btn icon"
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + step))}
        >
          <IconPlus />
        </button>
      </dd>
    </div>
  );
}

export default function ServicePanel({ sim, selectedRouteId, onSelectRoute, onPatch, onFares }: Props) {
  const routeId = selectedRouteId ?? sim.routes[0]?.id ?? '';
  const math = routeId ? routeServiceMath(sim, routeId) : null;
  const route = sim.routes.find((r) => r.id === routeId);
  const plan = sim.service[routeId];
  if (!math || !route || !plan) return null;
  const mode = route.mode === 'road' ? 'bus' : route.mode;
  const quick = QUICK_HEADWAYS[mode] ?? QUICK_HEADWAYS.bus;
  const caps = CAPACITY_OPTIONS[mode] ?? CAPACITY_OPTIONS.bus;

  const patch = (p: ServicePatch) => onPatch(route.id, p);
  // What-if preview for a different peak headway (same math, proposed value).
  const preview = (h: number) => {
    const eff = effectiveHeadway({ ...plan, peakHeadwayMin: h }, math.cycle, math.fleet, sim.timeMinutes);
    const req = fleetRequired(math.cycle, h);
    return { eff: Number.isFinite(eff) ? eff : h, req };
  };

  return (
    <Dock title="Service planning" meta={`${plan.peakHeadwayMin}m peak`}>
      <label className="tf-namelabel">
        Route
        <select value={route.id} onChange={(e) => onSelectRoute(e.target.value)}>
          {sim.routes.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </label>

      <h5>Time between vehicles</h5>
      <dl>
        <Stepper label="Peak" value={plan.peakHeadwayMin} display={`${plan.peakHeadwayMin} min`}
          min={3} max={30} onChange={(v) => patch({ peakHeadwayMin: clampHeadway(mode, v) })} />
      </dl>
      <div className="tf-speeds" role="group" aria-label="Peak headway presets, in minutes">
        {quick.map((h) => (
          <button key={h} type="button"
            className={`tf-btn small${plan.peakHeadwayMin === h ? ' active' : ''}`}
            aria-pressed={plan.peakHeadwayMin === h}
            onClick={() => patch({ peakHeadwayMin: h })}>
            {h} min
          </button>
        ))}
      </div>
      {plan.peakHeadwayMin > 3 && (() => {
        const pv = preview(plan.peakHeadwayMin - 1);
        return (
          <p className="tf-hint">
            One minute sooner at peak needs {pv.req} vehicles instead of {math.fleet}, and cuts the
            average wait from {math.estWait.toFixed(1)} to {(pv.eff / 2).toFixed(1)} min.
          </p>
        );
      })()}
      <dl>
        <Stepper label="Off-peak" value={plan.offPeakHeadwayMin} display={`${plan.offPeakHeadwayMin} min`}
          min={3} max={30} onChange={(v) => patch({ offPeakHeadwayMin: clampHeadway(mode, v) })} />
      </dl>

      <h5>Fleet and vehicles</h5>
      <dl>
        <Stepper label="Fleet size" value={plan.fleetSize} display={plan.fleetSize === 0 ? `auto (${math.fleet})` : String(plan.fleetSize)}
          min={0} max={24} onChange={(v) => patch({ fleetSize: v })} />
        <Stepper label="Speed" value={plan.speedKph} display={`${plan.speedKph} kph`}
          min={5} max={120} onChange={(v) => patch({ speedKph: v })} />
      </dl>
      <label className="tf-namelabel">
        Vehicle capacity
        <select value={plan.vehicleCapacity} onChange={(e) => patch({ vehicleCapacity: Number(e.target.value) })}>
          {caps.map((c) => (
            <option key={c} value={c}>{c} pax</option>
          ))}
        </select>
      </label>

      <h5>Operations</h5>
      <dl>
        <div className="tf-stat-row"><dt>Opens</dt><dd>
          <select value={plan.operatingStartMin} onChange={(e) => patch({ operatingStartMin: Number(e.target.value) })}>
            {TIME_STEPS.filter((t) => t < plan.operatingEndMin).map((t) => (
              <option key={t} value={t}>{formatClock(t)}</option>
            ))}
          </select>
        </dd></div>
        <div className="tf-stat-row"><dt>Closes</dt><dd>
          <select value={plan.operatingEndMin} onChange={(e) => patch({ operatingEndMin: Number(e.target.value) })}>
            {TIME_STEPS.filter((t) => t > plan.operatingStartMin).map((t) => (
              <option key={t} value={t}>{formatClock(t)}</option>
            ))}
          </select>
        </dd></div>
        <Stepper label="Station stop" value={plan.dwellBaseSec} display={`${plan.dwellBaseSec}s`}
          min={5} max={90} step={5} onChange={(v) => patch({ dwellBaseSec: v })} />
        <Stepper label="Turnaround" value={plan.turnaroundMin} display={`${plan.turnaroundMin} min`}
          min={0} max={30} onChange={(v) => patch({ turnaroundMin: v })} />
      </dl>
      <label className="tf-check">
        <input type="checkbox" checked={plan.syncEnabled} aria-label="Synchronize transfers" onChange={(e) => patch({ syncEnabled: e.target.checked })} />
        Synchronize transfers
      </label>

      <h5>Fares per trip, all routes (OCU)</h5>
      <dl>
        <Stepper label="Metro fare" value={sim.fares.metro} display={`${sim.fares.metro} OCU`}
          min={0} max={MAX_FARE} onChange={(v) => onFares({ ...sim.fares, metro: v })} />
        <Stepper label="Rail fare" value={sim.fares.rail} display={`${sim.fares.rail} OCU`}
          min={0} max={MAX_FARE} onChange={(v) => onFares({ ...sim.fares, rail: v })} />
        <Stepper label="Bus fare" value={sim.fares.bus} display={`${sim.fares.bus} OCU`}
          min={0} max={MAX_FARE} onChange={(v) => onFares({ ...sim.fares, bus: v })} />
      </dl>
      <p className="tf-hint">
        One ticket at the entry mode; transfers are free. Higher fares push riders
        to cars, and denied or unfinished trips earn nothing.
      </p>

      <h5>Reliability</h5>
      <dl>
        <Stepper label="Delay chance" value={plan.reliability.delayProb} display={`${Math.round(plan.reliability.delayProb * 100)}%`}
          min={0} max={0.3} step={0.01} onChange={(v) => patch({ reliability: { delayProb: Math.round(v * 100) / 100 } })} />
        <Stepper label="Average delay" value={plan.reliability.meanDelayMin} display={`${plan.reliability.meanDelayMin} min`}
          min={0} max={15} step={0.5} onChange={(v) => patch({ reliability: { meanDelayMin: v } })} />
        <Stepper label="Cancel chance" value={plan.reliability.cancelProb} display={`${(plan.reliability.cancelProb * 100).toFixed(1)}%`}
          min={0} max={0.1} step={0.005} onChange={(v) => patch({ reliability: { cancelProb: Math.round(v * 1000) / 1000 } })} />
      </dl>

      <h5>Derived</h5>
      <dl>
        <div className="tf-stat-row"><dt>Full cycle</dt><dd>{math.cycle.toFixed(1)} min</dd></div>
        <div className="tf-stat-row"><dt>Required fleet</dt><dd>{fleetRequired(math.cycle, math.scheduled)}</dd></div>
        <div className="tf-stat-row"><dt>Assigned / spare</dt><dd>{math.assigned} / {math.spare}</dd></div>
        <div className="tf-stat-row"><dt>Effective headway</dt><dd>{Number.isFinite(math.eff) ? `${math.eff.toFixed(1)} min` : 'no service'}</dd></div>
        <div className="tf-stat-row"><dt>Capacity/hour</dt><dd>{math.capHr.toLocaleString()}</dd></div>
        <div className="tf-stat-row"><dt>Est. wait</dt><dd>{Number.isFinite(math.estWait) ? `${math.estWait.toFixed(1)} min` : '—'}</dd></div>
        <div className="tf-stat-row"><dt>Peak occupancy</dt><dd>{math.peakOcc.toFixed(1)}%</dd></div>
        <div className="tf-stat-row"><dt>Denied boardings</dt><dd>{math.denied.toLocaleString()}</dd></div>
        <div className="tf-stat-row"><dt>Operating cost per day</dt><dd>{Math.round(math.dayCost).toLocaleString()} OCU</dd></div>
        <div className="tf-stat-row"><dt>Cost per passenger</dt><dd>{math.costPerPax.toFixed(2)} OCU</dd></div>
        <div className="tf-stat-row"><dt>Revenue</dt><dd>{math.revenue.toLocaleString()} OCU</dd></div>
        <div className="tf-stat-row"><dt>Cost recovery</dt><dd>{math.recovery.toFixed(1)}%</dd></div>
        <div className="tf-stat-row"><dt>Break-even fare</dt><dd>{math.breakEven.toFixed(2)} OCU</dd></div>
      </dl>
      <p className="tf-hint">
        Break-even holds ridership fixed — a real fare rise earns less than shown.
      </p>
    </Dock>
  );
}
