// Save-game library (v2). Same envelope discipline as the v1 scenario store:
// unknown versions are ignored, storage failures degrade to session-local.
// On first read, v1 scenarios migrate in automatically exactly once.
import { SAVE_VERSION } from '../../version.ts';
import { listScenarios } from './store.ts';
import { migrateScenarioV1, type SaveGame } from './persistence.ts';

const KEY = 'transitforge.saves.v2';
const MIGRATED_KEY = 'transitforge.saves.v2.migrated';

interface Envelope {
  version: 2;
  saves: SaveGame[];
}

function readEnvelope(): Envelope {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { version: 2, saves: [] };
    const parsed = JSON.parse(raw) as Envelope;
    if (parsed.version !== SAVE_VERSION || !Array.isArray(parsed.saves)) return { version: 2, saves: [] };
    return { version: 2, saves: parsed.saves.filter((s) => s && s.version === 2 && Array.isArray(s.ops)) };
  } catch {
    return { version: 2, saves: [] };
  }
}

function writeEnvelope(env: Envelope): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(env));
  } catch {
    // Storage full or unavailable: saves stay session-local.
  }
}

function migrateOnce(): void {
  try {
    if (localStorage.getItem(MIGRATED_KEY)) return;
    localStorage.setItem(MIGRATED_KEY, '1');
  } catch {
    return;
  }
  const env = readEnvelope();
  const have = new Set(env.saves.map((s) => s.scenarioId));
  for (const old of listScenarios()) {
    if (have.has(old.id)) continue;
    const migrated = migrateScenarioV1(old);
    if (migrated) env.saves.push(migrated);
  }
  writeEnvelope(env);
}

export function listSaves(): SaveGame[] {
  migrateOnce();
  return readEnvelope().saves;
}

export function upsertSave(save: SaveGame): void {
  migrateOnce();
  const env = readEnvelope();
  const idx = env.saves.findIndex((x) => x.id === save.id);
  if (idx < 0) env.saves.push(save);
  else env.saves[idx] = save;
  writeEnvelope(env);
}

export function deleteSave(id: string): void {
  const env = readEnvelope();
  env.saves = env.saves.filter((s) => s.id !== id);
  writeEnvelope(env);
}

export function duplicateSave(save: SaveGame): SaveGame {
  const copy: SaveGame = {
    ...save,
    id: `sv-${Date.now().toString(36)}-copy`,
    name: `${save.name} (copy)`,
    ops: save.ops.map((o) => ({ ...o })),
    savedAt: Date.now(),
  };
  upsertSave(copy);
  return copy;
}

export function renameSave(save: SaveGame, name: string): SaveGame {
  const next = { ...save, name: name.trim().slice(0, 48) || save.name, savedAt: Date.now() };
  upsertSave(next);
  return next;
}
