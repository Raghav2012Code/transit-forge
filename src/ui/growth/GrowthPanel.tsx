import type { SimStats } from '../../types/index.ts';
import type { GrowthPoint, PlanAdvice } from '../../simulation/growth/growth.ts';
import { Bars, Line } from '../analytics/charts.tsx';
import { SERIES } from '../analytics/seriesColors.ts';
import Dock from '../shell/Dock.tsx';

export interface GrowthSummary {
  pop: number;
  jobs: number;
  students: number;
  households: number;
  developed01: number;
  transitDay: number;
  carDay: number;
  popRate: number;
  jobRate: number;
}

export interface ForecastView {
  years: number;
  history: GrowthPoint[];
  endStats: SimStats;
  endAccess: number;
  before: { pop: number; jobs: number; transitDay: number; carDay: number; access: number; congest: number; crowd: number };
}

interface Props {
  year: number;
  summary: GrowthSummary;
  districts: { name: string; developed: number }[];
  history: GrowthPoint[];
  onAdvance: (years: number) => void;
  advancing: boolean;
  forecast: ForecastView | null;
  onForecast: (years: number) => void;
  advice: PlanAdvice;
}

const pct = (r: number) => `${r >= 0 ? '+' : ''}${(r * 100).toFixed(1)}%`;

export default function GrowthPanel({ year, summary, districts, history, onAdvance, advancing, forecast, onForecast, advice }: Props) {
  return (
    <Dock title="City growth" meta={`year ${year}`}>
      <div className="tf-stat-row"><dt>Simulation year</dt><dd>{year}</dd></div>
      <div className="tf-stat-row"><dt>Population</dt><dd>{summary.pop.toLocaleString()} ({pct(summary.popRate)})</dd></div>
      <div className="tf-stat-row"><dt>Jobs</dt><dd>{summary.jobs.toLocaleString()} ({pct(summary.jobRate)})</dd></div>
      <div className="tf-stat-row"><dt>Students</dt><dd>{summary.students.toLocaleString()}</dd></div>
      <div className="tf-stat-row"><dt>Developed land</dt><dd>{(summary.developed01 * 100).toFixed(0)}%</dd></div>
      <div className="tf-stat-row"><dt>Transit trips</dt><dd>≈{summary.transitDay.toLocaleString()}/day</dd></div>
      <div className="tf-stat-row"><dt>Car trips</dt><dd>≈{summary.carDay.toLocaleString()}/day</dd></div>
      <div className="tf-speeds" role="group" aria-label="Advance growth">
        {[1, 5, 10, 20].map((y) => (
          <button key={y} type="button" className="tf-btn small" disabled={advancing} onClick={() => onAdvance(y)}>
            +{y}y
          </button>
        ))}
      </div>
      {advancing && <p className="tf-hint">Growing…</p>}

      <h4>Forecast (simulation, not prediction)</h4>
      <div className="tf-speeds" role="group" aria-label="Forecast horizon">
        {[10, 20].map((y) => (
          <button key={y} type="button" className="tf-btn small" disabled={advancing} onClick={() => onForecast(y)}>
            {y}y
          </button>
        ))}
      </div>
      {forecast && forecast.history.length > 0 && (
        <>
          <div className="tf-stat-row"><dt>Population</dt><dd>{forecast.before.pop.toLocaleString()} → {forecast.history[forecast.history.length - 1].pop.toLocaleString()}</dd></div>
          <div className="tf-stat-row"><dt>Jobs</dt><dd>{forecast.before.jobs.toLocaleString()} → {forecast.history[forecast.history.length - 1].jobs.toLocaleString()}</dd></div>
          <div className="tf-stat-row"><dt>Transit/day</dt><dd>{forecast.before.transitDay.toLocaleString()} → {forecast.history[forecast.history.length - 1].transitDay.toLocaleString()}</dd></div>
          <div className="tf-stat-row"><dt>Car/day</dt><dd>{forecast.before.carDay.toLocaleString()} → {forecast.history[forecast.history.length - 1].carDay.toLocaleString()}</dd></div>
          <div className="tf-stat-row"><dt>Access</dt><dd>{forecast.before.access.toFixed(1)} → {forecast.endAccess.toFixed(1)}</dd></div>
          <div className="tf-stat-row"><dt>Congestion</dt><dd>{forecast.before.congest.toFixed(2)} → {forecast.endStats.avgCongestion.toFixed(2)}</dd></div>
          <div className="tf-stat-row"><dt>Crowding</dt><dd>{forecast.before.crowd.toFixed(1)}% → {forecast.endStats.maxOccupancy.toFixed(1)}%</dd></div>
          <h5>Population over time</h5>
          <Line values={forecast.history.map((p) => p.pop)} ariaLabel="Population over time" />
          <h5>Transit and car trips per day</h5>
          <Line values={forecast.history.map((p) => p.transitDay)} label="Transit" />
          <Line values={forecast.history.map((p) => p.carDay)} color={SERIES.secondary} dashed label="Car" />
          <h5>Access over time</h5>
          <Line values={forecast.history.map((p) => p.avgAccess)} color={SERIES.good} ariaLabel="Access score over time" />
        </>
      )}

      {(advice.warnings.length > 0 || advice.recommendations.length > 0) && (
        <>
          <h4>Planning warnings</h4>
          <ul className="tf-ranked">
            {advice.warnings.map((w, i) => (
              <li key={i}>{w.text}</li>
            ))}
          </ul>
          {advice.recommendations.map((r, i) => (
            <div key={i} className="tf-draft">
              <strong>{r.intervention}</strong>
              <div className="tf-hint">{r.reason}</div>
              <div className="tf-hint">{r.metrics}, {r.area}</div>
            </div>
          ))}
        </>
      )}

      <h4>Development by district (% developed)</h4>
      <Bars values={districts.map((d) => ({ label: d.name, value: Math.round(d.developed * 100) }))} />
      {history.length >= 2 && (
        <>
          <h4>Timeline (applied years)</h4>
          <h5>Population</h5>
          <Line values={history.map((p) => p.pop)} ariaLabel="Population over time" />
          <h5>Transit and car trips per day</h5>
          <Line values={history.map((p) => p.transitDay)} label="Transit" />
          <Line values={history.map((p) => p.carDay)} color={SERIES.secondary} dashed label="Car" />
          <h5>Access and congestion</h5>
          <Line values={history.map((p) => p.avgAccess)} color={SERIES.good} ariaLabel="Access score over time" />
          <Line values={history.map((p) => p.avgCongestion * 100)} color={SERIES.bad} label="Congestion" />
        </>
      )}
    </Dock>
  );
}
