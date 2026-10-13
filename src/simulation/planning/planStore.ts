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
/**
 * Bumped to 2 for the world-scale pass. A version-1 plan carries old-metre
 * coordinates, so it is dropped rather than loaded onto the wrong place; the
 * plan envelope has no per-plan version, so the envelope version gates it.
 */
const PLAN_VERSION = 2 as const;
/** Keep the store bounded so it cannot grow until the quota fails. */
const MAX_PLANS = 50;
const MAX_ATTEMPTS = 20;

interface Envelope {
  version: typeof PLAN_VERSION;
  plans: SavedPlan[];
}

function readEnvelope(): Envelope {
  const parsed = storageRead<Envelope>(KEY, { version: PLAN_VERSION, plans: [] });
  if (parsed.version !== PLAN_VERSION || !Array.isArray(parsed.plans)) return { version: PLAN_VERSION, plans: [] };
  return {
    version: PLAN_VERSION,
    plans: parsed.plans.filter((p) => p && typeof p.id === 'string' && Array.isArray(p.ops) && Array.isArray(p.attempts)),
  };
}

function writeEnvelope(env: Envelope): boolean {
  const plans = env.plans
    .toSorted((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, MAX_PLANS)
    .map((p) => (p.attempts.length > MAX_ATTEMPTS ? { ...p, attempts: p.attempts.slice(-MAX_ATTEMPTS) } : p));
  return storageWrite(KEY, { version: PLAN_VERSION, plans });
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
