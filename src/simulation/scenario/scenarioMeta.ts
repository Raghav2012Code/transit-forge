// Sidecar metadata for saved scenarios: favorites, completion, recency.
// Kept separate from the save payload so v1/v2 payloads never need migration
// when only product metadata changes. Storage failures degrade to memory.
import type { SaveGame } from './persistence.ts';

export interface ScenarioMeta {
  favorite: boolean;
  completedAt: number | null;
  lastOpenedAt: number;
  /** Last known objective progress 0..100 (snapshot, not recomputed). */
  progressPct: number;
}

const KEY = 'transitforge.scenario-meta.v1';
/** Cards shown on the Recent tab (UI caps display at this many). */
export const MAX_RECENT = 12;

interface Envelope {
  version: 1;
  meta: Record<string, ScenarioMeta>;
}

export function blankMeta(): ScenarioMeta {
  return { favorite: false, completedAt: null, lastOpenedAt: 0, progressPct: 0 };
}

function readEnvelope(): Envelope {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { version: 1, meta: {} };
    const parsed = JSON.parse(raw) as Envelope;
    if (parsed.version !== 1 || typeof parsed.meta !== 'object' || !parsed.meta) {
      return { version: 1, meta: {} };
    }
    return parsed;
  } catch {
    return { version: 1, meta: {} };
  }
}

function writeEnvelope(env: Envelope): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(env));
  } catch {
    // Unavailable: metadata stays session-local.
  }
}

export function getMeta(id: string): ScenarioMeta {
  return { ...blankMeta(), ...readEnvelope().meta[id] };
}

export function touchOpened(id: string, progressPct = 0): void {
  const env = readEnvelope();
  env.meta[id] = { ...blankMeta(), ...env.meta[id], lastOpenedAt: Date.now(), progressPct };
  writeEnvelope(env);
}

export function toggleFavorite(id: string): boolean {
  const env = readEnvelope();
  const next = !(env.meta[id]?.favorite ?? false);
  env.meta[id] = { ...blankMeta(), ...env.meta[id], favorite: next };
  writeEnvelope(env);
  return next;
}

export function markCompleted(id: string): void {
  const env = readEnvelope();
  env.meta[id] = { ...blankMeta(), ...env.meta[id], completedAt: Date.now(), progressPct: 100 };
  writeEnvelope(env);
}

export function dropMeta(id: string): void {
  const env = readEnvelope();
  delete env.meta[id];
  writeEnvelope(env);
}

/** Order saves for the Recent tab: most recently opened first. */
export function orderRecent(saves: SaveGame[]): SaveGame[] {
  const env = readEnvelope();
  const last = (s: SaveGame) => env.meta[s.id]?.lastOpenedAt ?? s.savedAt;
  return [...saves].sort((a, b) => last(b) - last(a));
}
