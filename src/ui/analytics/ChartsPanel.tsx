import type { SeriesPoint } from '../../simulation/analytics/series.ts';
import { formatClock } from '../../simulation/index.ts';

interface Props {
  history: SeriesPoint[];
  topStations: { name: string; boarded: number }[];
}

function Line({ values, color, height = 64 }: { values: number[]; color: string; height?: number }) {
  const w = 260;
  const max = Math.max(0.001, ...values);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${height - 4 - (v / max) * (height - 10)}`).join(' ');
  return (
    <svg width={w} height={height} className="tf-chart">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

function Bars({ values, color }: { values: { label: string; value: number }[]; color: string }) {
  const max = Math.max(0.001, ...values.map((v) => v.value));
  return (
    <div className="tf-bars">
      {values.map((v) => (
        <div key={v.label} className="tf-bar-row">
          <span>{v.label}</span>
          <div className="tf-bar-track">
            <div className="tf-bar-fill" style={{ width: `${(v.value / max) * 100}%`, background: color }} />
          </div>
          <span>{v.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export default function ChartsPanel({ history, topStations }: Props) {
  if (history.length < 2) return <p className="tf-hint">Charts appear as the simulation runs.</p>;
  const transitRate: number[] = [];
  const carRate: number[] = [];
  const travelWin: number[] = [];
  for (let i = 1; i < history.length; i++) {
    const a = history[i - 1];
    const b = history[i];
    transitRate.push(b.completed - a.completed);
    carRate.push(b.roadDone - a.roadDone);
    const dt = b.completed - a.completed;
    travelWin.push(dt > 0 ? (b.totalTravel - a.totalTravel) / dt : 0);
  }
  const last = history[history.length - 1];
  const first = history[0];
  const range = `${formatClock(first.t)}–${formatClock(last.t)}`;
  return (
    <div className="tf-charts">
      <h3>Charts <span className="tf-hint">{range}</span></h3>
      <h5>Trips / 5 min · transit</h5>
      <Line values={transitRate} color="#38bdf8" />
      <h5>Trips / 5 min · car</h5>
      <Line values={carRate} color="#fbbf24" />
      <h5>Avg travel / window (min)</h5>
      <Line values={travelWin.map((v) => Math.round(v * 10) / 10)} color="#4ade80" />
      <h5>Mode share (completed)</h5>
      <Bars
        color="#38bdf8"
        values={[
          { label: 'Transit', value: last.completed },
          { label: 'Car', value: last.roadDone },
        ]}
      />
      <h5>Top stations (boarded)</h5>
      <Bars color="#c084fc" values={topStations.map((s) => ({ label: s.name, value: s.boarded }))} />
    </div>
  );
}
