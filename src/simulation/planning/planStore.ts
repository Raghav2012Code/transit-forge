// Saved planning attempts. Versioned envelope; unknown versions are ignored.
import type { CompareRow } from '../scenario/compare.ts';
import type { EditOp } from '../scenario/scenario.ts';
import type { IncidentConfig } from '../incidents/incidents.ts';
import type { Objective, PlanConstraint } from './objectives.ts';

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
  createdAt: number;
  attempts: PlanAttempt[];
}

const KEY = 'transitforge.plans.v1';

interface Envelope {
  version: 1;
  plans: SavedPlan[];
}

function readEnvelope(): Envelope {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { version: 1, plans: [] };
    const parsed = JSON.parse(raw) as Envelope;
    if (parsed.version !== 1 || !Array.isArray(parsed.plans)) return { version: 1, plans: [] };
    return {
      version: 1,
      plans: parsed.plans.filter((p) => p && typeof p.id === 'string' && Array.isArray(p.ops) && Array.isArray(p.attempts)),
    };
  } catch {
    return { version: 1, plans: [] };
  }
}

function writeEnvelope(env: Envelope): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(env));
  } catch {
    // Storage full or unavailable: plans stay session-local.
  }
}

export function listPlans(): SavedPlan[] {
  return readEnvelope().plans;
}

export function savePlan(p: SavedPlan): void {
  const env = readEnvelope();
  const idx = env.plans.findIndex((x) => x.id === p.id);
  if (idx < 0) env.plans.push(p);
  else env.plans[idx] = p;
  writeEnvelope(env);
}

export function deletePlan(id: string): void {
  const env = readEnvelope();
  env.plans = env.plans.filter((p) => p.id !== id);
  writeEnvelope(env);
}

export function makePlanId(): string {
  return `plan-${Date.now().toString(36)}`;
}
