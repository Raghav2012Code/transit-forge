import { formatClock } from '../../simulation/index.ts';
import type { CompareRow } from '../../simulation/scenario/compare.ts';
import type { DayResult } from '../../workers/handlers.ts';
import { PairLine } from '../analytics/charts.tsx';
import { compareTone } from '../build/compareTone.ts';
import Dock from '../shell/Dock.tsx';

export interface ForkResult {
  atMin: number;
  a: DayResult;
  b: DayResult;
  rows: CompareRow[];
}

interface Props {
  /** Set once the day has been forked: the minute it was forked at. */
  fork: { atMin: number } | null;
  /** Edits and disruptions made since the fork. */
  changes: number;
  running: boolean;
  error: string | null;
  result: ForkResult | null;
  onFork: () => void;
  onCompare: () => void;
  onDiscard: () => void;
}

/** The side panel is narrow, so the change is the percentage; the figures beside it say the rest. */
const change = (r: CompareRow) => (r.pct === null ? '—' : `${r.pct > 0 ? '+' : ''}${r.pct}%`);

/** A text row that reads the same on both days says nothing, so it is left out. */
const shown = (r: CompareRow) => r.pct !== null || r.base !== r.mod;

const peopleIn = (r: DayResult) => r.series.map((p) => p.waiting + p.onboard);
const completed = (r: DayResult) => r.series.map((p) => p.completed);

/**
 * The time machine's side panel: fork the day at the current minute, change something, and compare the
 * two days. Both days are the same simulation up to the fork, so any difference is what you changed.
 */
export default function ForkCard({ fork, changes, running, error, result, onFork, onCompare, onDiscard }: Props) {
  return (
    <Dock title="Time machine" meta={fork ? `forked ${formatClock(fork.atMin)}` : undefined}>
      {!fork ? (
        <>
          <p className="tf-hint">
            Click the past on the day strip to rewind. Fork the day here, change a headway or a fare or add a
            disruption, then compare it with the day that would have been.
          </p>
          <button type="button" className="tf-btn small primary" onClick={onFork}>Fork the day here</button>
        </>
      ) : (
        <>
          <p className="tf-hint">
            Forked at {formatClock(fork.atMin)}. {changes === 0 ? 'Nothing has changed since.' : `${changes} ${changes === 1 ? 'change' : 'changes'} since.`}
          </p>
          <div className="tf-draft-actions">
            <button type="button" className="tf-btn small primary" disabled={changes === 0 || running} onClick={onCompare}>
              {running ? 'Running both days…' : 'Compare with the unforked day'}
            </button>
            <button type="button" className="tf-btn small" disabled={running} onClick={onDiscard}>Discard fork</button>
          </div>
        </>
      )}
      {error && <p className="tf-hint tf-warn">{error}</p>}
      {result && (
        <>
          <table className="tf-compare-table tf-fork-table">
            <thead>
              <tr><th>Metric</th><th>Unforked</th><th>Changed</th><th>Change</th></tr>
            </thead>
            <tbody>
              {result.rows.filter(shown).map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <td>{r.base}</td>
                  <td>{r.mod}</td>
                  <td className={compareTone(r)}>{change(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h5>People in the network</h5>
          <PairLine a={peopleIn(result.a)} b={peopleIn(result.b)} aLabel="Unforked" bLabel="Changed" />
          <h5>Trips completed so far</h5>
          <PairLine a={completed(result.a)} b={completed(result.b)} aLabel="Unforked" bLabel="Changed" />
          <p className="tf-hint">Both days are the same until {formatClock(result.atMin)}. Run to the end of the day, same seed.</p>
        </>
      )}
    </Dock>
  );
}
