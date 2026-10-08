// Putting the clock back. The simulation is deterministic, so any minute of the day can be rebuilt
// exactly by running a fresh simulation forward to it. The work is done in chunks so a caller can
// spread it over frames; chunking never changes the result.
import { stepSimulation, type SimulationState } from './index.ts';

export interface Replay {
  sim: SimulationState;
  /** Absolute minute to run to. */
  targetMin: number;
  startMin: number;
  done: boolean;
}

/** Begin replaying a freshly created sim up to an absolute minute. */
export function startReplay(sim: SimulationState, targetMin: number): Replay {
  return { sim, targetMin, startMin: sim.timeMinutes, done: sim.timeMinutes >= targetMin };
}

/** Run up to maxTicks more minutes. `onStep` sees the state after each one. */
export function advanceReplay(r: Replay, maxTicks: number, onStep?: (sim: SimulationState) => void): void {
  for (let i = 0; i < maxTicks && r.sim.timeMinutes < r.targetMin; i++) {
    r.sim = stepSimulation(r.sim, 1);
    onStep?.(r.sim);
  }
  r.done = r.sim.timeMinutes >= r.targetMin;
}

/**
 * Run for about `budgetMs` of wall time (at least one tick, so it always makes progress), then stop.
 * The clock is injected so this stays testable.
 */
export function advanceReplayFor(
  r: Replay,
  budgetMs: number,
  now: () => number,
  onStep?: (sim: SimulationState) => void,
): void {
  const stop = now() + budgetMs;
  do {
    advanceReplay(r, 1, onStep);
  } while (!r.done && now() < stop);
}

export function replayProgress01(r: Replay): number {
  const span = r.targetMin - r.startMin;
  return span <= 0 ? 1 : Math.min(1, Math.max(0, (r.sim.timeMinutes - r.startMin) / span));
}
