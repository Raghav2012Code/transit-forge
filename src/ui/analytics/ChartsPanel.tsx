import type { SeriesPoint } from '../../simulation/analytics/series.ts';
import { formatClock } from '../../simulation/index.ts';
import { Bars, Line } from './charts.tsx';
import { SERIES } from './seriesColors.ts';
import Dock from '../shell/Dock.tsx';

interface Props {
  history: SeriesPoint[];
  topStations: { name: string; boarded: number }[];
}

export default function ChartsPanel({ history, topStations }: Props) {
  if (history.length < 2) {
    return (
      <Dock title="Charts" meta="warming up">
        <p className="tf-hint">Charts appear as the simulation runs.</p>
      </Dock>
    );
  }
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
    <Dock title="Charts" meta={range}>
      <h5>Trips per 5 minutes</h5>
      <Line values={transitRate} label="Transit" />
      <Line values={carRate} color={SERIES.secondary} dashed label="Car" />
      <h5>Average travel time per window (min)</h5>
      <Line values={travelWin.map((v) => Math.round(v * 10) / 10)} ariaLabel="Average travel time" />
      <h5>Mode share (completed trips)</h5>
      <Bars
        values={[
          { label: 'Transit', value: last.completed },
          { label: 'Car', value: last.roadDone },
        ]}
      />
      <h5>Top stations (boarded)</h5>
      <Bars values={topStations.map((s) => ({ label: s.name, value: s.boarded }))} />
    </Dock>
  );
}
