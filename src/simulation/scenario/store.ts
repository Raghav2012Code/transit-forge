// Browser-local scenario persistence. Versioned envelope so the schema can
// evolve; unknown versions are ignored rather than crashing.
import type { Scenario } from './scenario.ts';

const KEY = 'transitforge.scenarios.v1';

interface Envelope {
  version: 1;
  scenarios: Scenario[];
}

function readEnvelope(): Envelope {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { version: 1, scenarios: [] };
    const parsed = JSON.parse(raw) as Envelope;
    if (parsed.version !== 1 || !Array.isArray(parsed.scenarios)) return { version: 1, scenarios: [] };
    return { version: 1, scenarios: parsed.scenarios.filter((s) => s && s.version === 1 && Array.isArray(s.ops)) };
  } catch {
    return { version: 1, scenarios: [] };
  }
}

function writeEnvelope(env: Envelope): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(env));
  } catch {
    // Storage full or unavailable: scenarios stay session-local.
  }
}

export function listScenarios(): Scenario[] {
  return readEnvelope().scenarios;
}

export function saveScenario(s: Scenario): void {
  const env = readEnvelope();
  const idx = env.scenarios.findIndex((x) => x.id === s.id);
  const stamped = { ...s, updatedAt: Date.now() };
  if (idx < 0) env.scenarios.push(stamped);
  else env.scenarios[idx] = stamped;
  writeEnvelope(env);
}

export function deleteScenario(id: string): void {
  const env = readEnvelope();
  env.scenarios = env.scenarios.filter((s) => s.id !== id);
  writeEnvelope(env);
}

export function duplicateScenario(s: Scenario): Scenario {
  const copy: Scenario = {
    ...s,
    id: `sc-${Date.now().toString(36)}-copy`,
    name: `${s.name} (copy)`,
    ops: s.ops.map((o) => ({ ...o })),
    updatedAt: Date.now(),
  };
  const env = readEnvelope();
  env.scenarios.push(copy);
  writeEnvelope(env);
  return copy;
}

/** Serialize one scenario for export / tests (same envelope version). */
export function serializeScenario(s: Scenario): string {
  return JSON.stringify({ version: 1 as const, scenario: s });
}

export function deserializeScenario(raw: string): Scenario | null {
  try {
    const parsed = JSON.parse(raw) as { version: number; scenario: Scenario };
    if (parsed.version !== 1 || !parsed.scenario || !Array.isArray(parsed.scenario.ops)) return null;
    return parsed.scenario;
  } catch {
    return null;
  }
}
