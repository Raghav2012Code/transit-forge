// Scenario save format v2: everything needed to reconstruct a session.
// Pure data + validation. No React, no Three.js, no localStorage here —
// storage backends live in the stores that use this module.
// v1 (Scenario: id/name/seed/ops) migrates losslessly; anything older or
// malformed is rejected with reasons, never with an exception.
import { SAVE_VERSION } from '../../version.ts';
import type { Zone } from '../../types/index.ts';
import type { FarePolicy } from '../economics/fares.ts';
import { DEFAULT_FARES, sanitizeFares } from '../economics/fares.ts';
import type { GrowthPoint } from '../growth/growth.ts';
import type { IncidentConfig } from '../incidents/incidents.ts';
import type { Difficulty } from '../planning/briefs.ts';
import type { EditOp, Scenario } from './scenario.ts';

export interface SaveAnalytics {
  overlay: string;
  demandLayer: string;
  travelDest: string;
  coverageThreshold: number;
}

export interface SaveGame {
  version: 2;
  kind: 'transitforge-savegame';
  /** Stable identity across renames (browser actions key on this). */
  id: string;
  appVersion: string;
  savedAt: number;
  /** Display name (also the browser card title). */
  name: string;
  seed: number;
  /** Infrastructure + service + fare edits; replayed onto the base network. */
  ops: EditOp[];
  fares: FarePolicy;
  /** Sim tick to fast-forward to after replay (0 = fresh morning). */
  tick: number;
  /** Grown zones (null = pristine seed city) + applied years + capped history. */
  zones: Zone[] | null;
  yearsApplied: number;
  growthHistory: GrowthPoint[];
  /** Unfinished incident configs to re-schedule before fast-forward. */
  incidents: IncidentConfig[];
  /** Planning context. */
  briefId: string | null;
  difficulty: Difficulty;
  planHorizon: number;
  completedBriefIds: string[];
  analytics: SaveAnalytics;
  /** Link back to a scenario-library entry, if this save came from one. */
  scenarioId: string | null;
}

export const DEFAULT_ANALYTICS: SaveAnalytics = {
  overlay: 'normal',
  demandLayer: 'origins',
  travelDest: 'cbd',
  coverageThreshold: 500,
};

export function makeSaveId(): string {
  return `sv-${Date.now().toString(36)}`;
}

export function blankSave(name: string, seed: number): SaveGame {
  return {
    version: SAVE_VERSION,
    id: makeSaveId(),
    kind: 'transitforge-savegame',
    appVersion: 'unknown',
    savedAt: 0,
    name,
    seed,
    ops: [],
    fares: { ...DEFAULT_FARES },
    tick: 0,
    zones: null,
    yearsApplied: 0,
    growthHistory: [],
    incidents: [],
    briefId: null,
    difficulty: 'medium',
    planHorizon: 5,
    completedBriefIds: [],
    analytics: { ...DEFAULT_ANALYTICS },
    scenarioId: null,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Validate unknown parsed JSON as a SaveGame. Returns reasons; empty = valid. */
export function validateSaveGame(raw: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(raw)) return ['File is not a JSON object.'];
  if (raw.version !== 2) errors.push(`Unsupported save version (${String(raw.version)}); this build reads version 2.`);
  if (raw.kind !== 'transitforge-savegame') errors.push('Not a TransitForge scenario file (bad kind marker).');
  if (typeof raw.name !== 'string' || raw.name.trim().length === 0) errors.push('Missing scenario name.');
  if (typeof raw.seed !== 'number' || !Number.isFinite(raw.seed)) errors.push('Missing or invalid city seed.');
  if (!Array.isArray(raw.ops)) errors.push('Missing edit-operation list.');
  else {
    const bad = raw.ops.findIndex((o) => !isRecord(o) || typeof o.type !== 'string');
    if (bad >= 0) errors.push(`Edit operation #${bad + 1} is malformed.`);
  }
  if (typeof raw.tick !== 'number' || !Number.isFinite(raw.tick) || raw.tick < 0) {
    errors.push('Missing or invalid simulation tick.');
  }
  if (raw.zones !== null && !Array.isArray(raw.zones)) errors.push('City growth data is malformed.');
  if (!Array.isArray(raw.incidents)) errors.push('Incident list is malformed.');
  if (raw.briefId !== null && typeof raw.briefId !== 'string') errors.push('Planning brief reference is malformed.');
  if (!isRecord(raw.analytics)) errors.push('Analytics preferences are malformed.');
  return errors;
}

/** Parse + validate an imported file. Never throws. */
export function parseSaveGame(text: string): { save: SaveGame; warnings: string[] } | { errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { errors: ['File is not valid JSON.'] };
  }
  // v1 scenario files migrate automatically.
  if (isRecord(parsed) && parsed.version === 1 && isRecord(parsed.scenario)) {
    const migrated = migrateScenarioV1(parsed.scenario as unknown as Scenario);
    if (!migrated) return { errors: ['This v1 scenario file is malformed and cannot be migrated.'] };
    return { save: migrated, warnings: ['Migrated from save format v1 (edits only; fresh morning, default analytics).'] };
  }
  const errors = validateSaveGame(parsed);
  if (errors.length > 0) return { errors };
  const save = parsed as SaveGame;
  return { save: { ...save, fares: sanitizeFares(save.fares ?? DEFAULT_FARES) }, warnings: [] };
}

/** Lossless v1 → v2 migration (v1 only ever carried id/name/seed/ops). */
export function migrateScenarioV1(s: Scenario): SaveGame | null {
  if (!s || s.version !== 1 || typeof s.name !== 'string' || typeof s.seed !== 'number' || !Array.isArray(s.ops)) {
    return null;
  }
  const blank = blankSave(s.name, s.seed);
  return {
    ...blank,
    id: s.id,
    savedAt: s.updatedAt ?? Date.now(),
    ops: s.ops.map((o) => ({ ...o })),
    scenarioId: s.id,
  };
}

/** Serialize for export (pretty, stable key order is JSON default). */
export function serializeSaveGame(save: SaveGame): string {
  return JSON.stringify(save, null, 2);
}

/** Suggested download filename for a save. */
export function saveFileName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'scenario';
  return `${slug}.tfscenario.json`;
}
