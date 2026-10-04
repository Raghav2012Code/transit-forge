import type { DemoScenario, DemoAction } from '../../simulation/scenario/demos.ts';
import Dock from '../shell/Dock.tsx';

export interface WelcomeStats {
  population: number;
  jobs: number;
  lines: number;
  stations: number;
  dailyTrips: number;
  congestion: number;
  access: number;
}

interface Props {
  title: string;
  intro: string[];
  stats: WelcomeStats;
  suggestions: { label: string; action: DemoAction }[];
  onAction: (a: DemoAction) => void;
  onDismiss: () => void;
}

/** Contextual welcome card for the demo city and demo scenarios. */
export default function DemoWelcome({ title, intro, stats, suggestions, onAction, onDismiss }: Props) {
  return (
    <Dock title={title} meta="welcome">
      {intro.map((p, i) => <p className="tf-hint" key={i}>{p}</p>)}
      <dl>
        <div className="tf-stat-row"><dt>Population</dt><dd>{stats.population.toLocaleString()}</dd></div>
        <div className="tf-stat-row"><dt>Employment</dt><dd>{stats.jobs.toLocaleString()}</dd></div>
        <div className="tf-stat-row"><dt>Transit lines / stations</dt><dd>{stats.lines} / {stats.stations}</dd></div>
        <div className="tf-stat-row"><dt>Daily trips</dt><dd>{stats.dailyTrips.toLocaleString()}</dd></div>
        <div className="tf-stat-row"><dt>Congestion</dt><dd>{stats.congestion}</dd></div>
        <div className="tf-stat-row"><dt>Accessibility</dt><dd>{stats.access}</dd></div>
      </dl>
      <h5>Try this</h5>
      {suggestions.map((s) => (
        <button key={s.action} type="button" className="tf-btn small" onClick={() => onAction(s.action)}>
          {s.label}
        </button>
      ))}
      <div className="tf-draft-actions">
        <button type="button" className="tf-btn small" onClick={onDismiss}>Dismiss</button>
      </div>
    </Dock>
  );
}

export const DEMO_CITY_INTRO = [
  'Welcome to the demo city. Ten districts, six transit lines, and a full day of travel demand — all simulated live.',
  'Press Play, inspect anything that catches your eye, and break things safely: Build mode never touches your saves.',
];

export function demoCitySuggestions(): { label: string; action: DemoAction }[] {
  return [
    { label: 'Inspect Central interchange', action: 'inspect-central' },
    { label: 'View passenger demand', action: 'show-demand' },
    { label: 'Open accessibility analysis', action: 'show-access' },
    { label: 'Enter Build mode', action: 'enter-build' },
    { label: 'Run simulation', action: 'run-sim' },
  ];
}
