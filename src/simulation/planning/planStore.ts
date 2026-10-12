// Saved planning attempts. Versioned envelope; unknown versions are ignored.
import type { CompareRow } from '../scenario/compare.ts';
import type { EditOp } from '../scenario/scenario.ts';
import type { IncidentConfig } from '../incidents/incidents.ts';
import type { Objective, PlanConstraint } from './objectives.ts';
import type { Difficulty } from './briefs.ts';
import { storageRead, storageWrite } from '../scenario/store.ts';

export interface PlanAttempt {
  atClock: string;
  score: number;
  passed: boolean;
  horizonYears: number;
  rows: CompareRow[];
}

export interface SavedPlan {
  id: string;
  name: string;
  seed: number;
  briefId: string | null;
  ops: EditOp[];
  objectives: Objective[];
  constraints: PlanConstraint[];
  horizonYears: number;
  incident?: IncidentConfig;
  /** Difficulty the brief was generated at, so a load restores its constraints. */
  difficulty?: Difficulty;
  createdAt: number;
  attempts: PlanAttempt[];
}

const KEY = 'transitforge.plans.v1';

interface Envelope {
  version: 1;
  plans: SavedPlan[];
}

function readEnvelope(): Envelope {
  const parsed = storageRead<Envelope>(KEY, { version: 1, plans: [] });
  if (parsed.version !== 1 || !Array.isArray(parsed.plans)) return { version: 1, plans: [] };
  return {
    version: 1,
    plans: parsed.plans.filter((p) => p && typeof p.id === 'string' && Array.isArray(p.ops) && Array.isArray(p.attempts)),
  };
}

function writeEnvelope(env: Envelope): boolean {
  return storageWrite(KEY, env);
}

export function listPlans(): SavedPlan[] {
  return readEnvelope().plans;
}

export function savePlan(p: SavedPlan): boolean {
  const env = readEnvelope();
  const idx = env.plans.findIndex((x) => x.id === p.id);
  if (idx < 0) env.plans.push(p);
  else env.plans[idx] = p;
  return writeEnvelope(env);
}

export function deletePlan(id: string): void {
  const env = readEnvelope();
  env.plans = env.plans.filter((p) => p.id !== id);
  writeEnvelope(env);
}

let planSeq = 0;

export function makePlanId(): string {
  // Date.now alone collides for ids made in the same millisecond; the counter
  // keeps them unique within a session.
  return `plan-${Date.now().toString(36)}-${(planSeq++).toString(36)}`;
}
