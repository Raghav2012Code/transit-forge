import type { SeriesPoint } from '../../simulation/analytics/series.ts';
import type { Incident, SimStats } from '../../types/index.ts';
import SimControls, { type Speed } from '../controls/SimControls.tsx';
import DayStrip from './DayStrip.tsx';
import { IconChevron, IconReports } from './icons.tsx';
import { congTone, occTone } from './tones.ts';

type Tone = '' | 'good' | 'warn' | 'bad';

const recoveryTone = (v: number): Tone => (v >= 60 ? 'good' : v >= 30 ? 'warn' : 'bad');

interface Props {
  playing: boolean;
  speed: Speed;
  tick: number;
  timeMinutes: number;
  onToggle: () => void;
  onSpeed: (s: Speed) => void;
  onReset: () => void;
  onStep: () => void;
  stats: SimStats;
  history: SeriesPoint[];
  incidents: Incident[];
  runTarget: number | null;
  onRunTo: (absoluteMinute: number) => void;
  onRewindTo: (absoluteMinute: number) => void;
  rewind: { target: number; progress: number } | null;
  /** Omit both to leave the reports button out. */
  reportsOpen?: boolean;
  onReports?: () => void;
}

/**
 * The foot of the workspace: the clock and its controls, the service day,
 * and the six readings you glance at while it runs. Everything else lives in
 * the reports sheet one click above.
 */
export default function DayBar(p: Props) {
  const s = p.stats;
  const readings: { key: string; label: string; value: string; tone: Tone }[] = [
    { key: 'transit', label: 'Transit share', value: `${s.transitShare}%`, tone: '' },
    { key: 'congestion', label: 'Congestion', value: s.avgCongestion.toFixed(2), tone: congTone(s.avgCongestion) },
    { key: 'load', label: 'Peak load', value: `${s.maxOccupancy}%`, tone: occTone(s.maxOccupancy) },
    { key: 'wait', label: 'Average wait', value: `${s.avgWaitMin} min`, tone: '' },
    { key: 'recovery', label: 'Cost recovery', value: `${s.costRecovery}%`, tone: recoveryTone(s.costRecovery) },
    { key: 'incidents', label: 'Disruptions', value: String(s.activeIncidents), tone: s.activeIncidents > 0 ? 'bad' : '' },
  ];
  return (
    <footer className="tf-daybar" aria-label="Simulation clock and readings">
      <SimControls
        playing={p.playing}
        speed={p.speed}
        tick={p.tick}
        timeMinutes={p.timeMinutes}
        onToggle={p.onToggle}
        onSpeed={p.onSpeed}
        onReset={p.onReset}
        onStep={p.onStep}
      />
      <DayStrip
        timeMinutes={p.timeMinutes}
        history={p.history}
        incidents={p.incidents}
        runTarget={p.runTarget}
        onRunTo={p.onRunTo}
        onRewindTo={p.onRewindTo}
        rewind={p.rewind}
      />
      <dl className="tf-readings">
        {readings.map((r) => (
          <div key={r.key} className={`tf-reading${r.tone ? ` ${r.tone}` : ''}`}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
      {p.onReports && (
        <button
          type="button"
          className={`tf-reports-toggle${p.reportsOpen ? ' open' : ''}`}
          aria-expanded={p.reportsOpen ?? false}
          aria-controls="tf-reports"
          onClick={p.onReports}
          title="Reports (S)"
        >
          <IconReports />
          <span>Reports</span>
          <IconChevron className="tf-caret" />
        </button>
      )}
    </footer>
  );
}
