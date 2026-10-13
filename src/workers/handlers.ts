// What a worker does with a message. Kept apart from the worker file so it can be tested in-process.
import type { CityData, SimStats } from '../types/index.ts';
import type { SeriesPoint } from '../simulation/analytics/series.ts';
import type { IncidentConfig } from '../simulation/incidents/incidents.ts';
import { applyEdits } from '../simulation/scenario/applyEdits.ts';
import { runDay } from '../simulation/scenario/compare.ts';
import type { EditOp } from '../simulation/scenario/scenario.ts';
import type { NetworkData } from '../simulation/transport/network.ts';

/** One branch of a day: the scenario's edits, and the incidents added by hand. */
export interface DaySide {
  ops: EditOp[];
  incidents: IncidentConfig[];
}

export interface RunDayRequest {
  type: 'runDay';
  id: number;
  seed: number;
  city: CityData;
  net: NetworkData;
  side: DaySide;
  /** Absolute minute to run to. */
  endMin: number;
}

export interface DayResult {
  stats: SimStats;
  series: SeriesPoint[];
  /** Construction cost of the side's edits. */
  cost: number;
}

export type WorkerRequest = RunDayRequest;
export type WorkerReply =
  | { type: 'day'; id: number; result: DayResult }
  | { type: 'error'; id: number; message: string };

/** The same day the live simulation would play, built from the same pieces, run to the end headless. */
export function runDayFor(req: RunDayRequest): DayResult {
  const mod = applyEdits(req.city, req.net, req.side.ops);
  const { stats, series } = runDay(req.seed, mod.city, { ...mod, incidents: [...mod.incidents, ...req.side.incidents] }, req.endMin);
  return { stats, series, cost: mod.cost };
}

export function handle(req: WorkerRequest): WorkerReply {
  try {
    return { type: 'day', id: req.id, result: runDayFor(req) };
  } catch (e) {
    return { type: 'error', id: req.id, message: e instanceof Error ? e.message : String(e) };
  }
}
