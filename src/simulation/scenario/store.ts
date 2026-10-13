// Browser-local scenario persistence. Versioned envelope so the schema can
// evolve; unknown versions are ignored rather than crashing. Version 2 is the
// world-scale format: version-1 saves carry old-metre coordinates and are
// dropped, never loaded onto the wrong place.
import { SCENARIO_VERSION, type Scenario } from './scenario.ts';

const KEY = 'transitforge.scenarios.v1';
/** Keep the store bounded so it cannot grow until the quota fails. */
const MAX_SCENARIOS = 50;

export function storageRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Returns false when the write did not persist (quota full or storage blocked). */
export function storageWrite(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Storage full or unavailable: stays session-local.
    return false;
  }
}

interface Envelope {
  version: typeof SCENARIO_VERSION;
  scenarios: Scenario[];
}

function readEnvelope(): Envelope {
  const parsed = storageRead<Envelope>(KEY, { version: SCENARIO_VERSION, scenarios: [] });
  if (parsed.version !== SCENARIO_VERSION || !Array.isArray(parsed.scenarios)) {
    return { version: SCENARIO_VERSION, scenarios: [] };
  }
  return {
    version: SCENARIO_VERSION,
    scenarios: parsed.scenarios.filter((s) => s && s.version === SCENARIO_VERSION && Array.isArray(s.ops)),
  };
}

function writeEnvelope(env: Envelope): boolean {
  if (env.scenarios.length > MAX_SCENARIOS) {
    env.scenarios = env.scenarios
      .toSorted((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .slice(0, MAX_SCENARIOS);
  }
  return storageWrite(KEY, env);
}

export function listScenarios(): Scenario[] {
  return readEnvelope().scenarios;
}

/** A scenario to save; the version is stamped here, so callers need not set it. */
export type ScenarioInput = Omit<Scenario, 'version'> & { version?: number };

export function saveScenario(s: ScenarioInput): boolean {
  const env = readEnvelope();
  const idx = env.scenarios.findIndex((x) => x.id === s.id);
  const stamped: Scenario = { ...s, version: SCENARIO_VERSION, updatedAt: Date.now() };
  if (idx < 0) env.scenarios.push(stamped);
  else env.scenarios[idx] = stamped;
  return writeEnvelope(env);
}

export function deleteScenario(id: string): void {
  const env = readEnvelope();
  env.scenarios = env.scenarios.filter((s) => s.id !== id);
  writeEnvelope(env);
}

let copySeq = 0;

export function duplicateScenario(s: Scenario): boolean {
  const copy: Scenario = {
    ...s,
    version: SCENARIO_VERSION,
    id: `sc-${Date.now().toString(36)}-${(copySeq++).toString(36)}-copy`,
    name: `${s.name} (copy)`,
    ops: s.ops.map((o) => ({ ...o })),
    updatedAt: Date.now(),
  };
  const env = readEnvelope();
  env.scenarios.push(copy);
  return writeEnvelope(env);
}

/** Serialize one scenario for export / tests (same envelope version). */
export function serializeScenario(s: Scenario): string {
  return JSON.stringify({ version: SCENARIO_VERSION, scenario: s });
}

export function deserializeScenario(raw: string): Scenario | null {
  try {
    const parsed = JSON.parse(raw) as { version: number; scenario: Scenario };
    if (parsed.version !== SCENARIO_VERSION) return null;
    if (!parsed.scenario || parsed.scenario.version !== SCENARIO_VERSION || !Array.isArray(parsed.scenario.ops)) return null;
    return parsed.scenario;
  } catch {
    return null;
  }
}
