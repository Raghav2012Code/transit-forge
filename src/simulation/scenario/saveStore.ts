// Save-game library (v2). Same envelope discipline as the scenario store:
// unknown versions are ignored, storage failures degrade to session-local.
// Pre-scale v1 scenarios are never loaded: their coordinates are in the old
// ~1.2 km metre and would land on the wrong place in the 5x city.
import { SAVE_VERSION } from '../../version.ts';
import { storageRead, storageWrite } from './storage.ts';
import type { SaveGame } from './persistence.ts';

const KEY = 'transitforge.saves.v2';

interface Envelope {
  version: 2;
  saves: SaveGame[];
}

function readEnvelope(): Envelope {
  const parsed = storageRead<Envelope>(KEY, { version: 2, saves: [] });
  if (parsed.version !== SAVE_VERSION || !Array.isArray(parsed.saves)) return { version: 2, saves: [] };
  return { version: 2, saves: parsed.saves.filter((s) => s && s.version === 2 && Array.isArray(s.ops)) };
}

function writeEnvelope(env: Envelope): boolean {
  return storageWrite(KEY, env);
}

export function listSaves(): SaveGame[] {
  return readEnvelope().saves;
}

/** Returns false when the write did not persist (quota full or storage blocked). */
export function upsertSave(save: SaveGame): boolean {
  const env = readEnvelope();
  const idx = env.saves.findIndex((x) => x.id === save.id);
  if (idx < 0) env.saves.push(save);
  else env.saves[idx] = save;
  return writeEnvelope(env);
}

/** Returns false when the removal did not persist. */
export function deleteSave(id: string): boolean {
  const env = readEnvelope();
  env.saves = env.saves.filter((s) => s.id !== id);
  return writeEnvelope(env);
}

export function duplicateSave(save: SaveGame): { save: SaveGame; ok: boolean } {
  const copy: SaveGame = {
    ...save,
    id: `sv-${Date.now().toString(36)}-copy`,
    name: `${save.name} (copy)`,
    ops: save.ops.map((o) => ({ ...o })),
    savedAt: Date.now(),
  };
  return { save: copy, ok: upsertSave(copy) };
}

export function renameSave(save: SaveGame, name: string): { save: SaveGame; ok: boolean } {
  const next = { ...save, name: name.trim().slice(0, 48) || save.name, savedAt: Date.now() };
  return { save: next, ok: upsertSave(next) };
}
