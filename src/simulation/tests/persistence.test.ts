import { describe, expect, it } from 'vitest';
import {
  blankSave,
  migrateScenarioV1,
  parseSaveGame,
  saveFileName,
  serializeSaveGame,
  validateSaveGame,
} from '../scenario/persistence.ts';

describe('savegame format', () => {
  it('round-trips through export serialization', () => {
    const save = {
      ...blankSave('Harbor Fix', 1337),
      ops: [{ type: 'setService' as const, routeId: 'rt-b1', patch: { peakHeadwayMin: 8 } }],
      fares: { metro: 5, rail: 6, bus: 2 },
      tick: 240,
      briefId: 'overcrowding',
    };
    const parsed = parseSaveGame(serializeSaveGame(save));
    expect('save' in parsed).toBe(true);
    if ('save' in parsed) {
      expect(parsed.save.name).toBe('Harbor Fix');
      expect(parsed.save.ops).toEqual(save.ops);
      expect(parsed.save.fares).toEqual(save.fares);
      expect(parsed.save.tick).toBe(240);
      expect(parsed.warnings).toEqual([]);
    }
  });

  it('rejects malformed files with useful reasons, never throws', () => {
    expect(parseSaveGame('not json{')).toEqual({ errors: ['File is not valid JSON.'] });
    const badVersion = parseSaveGame(JSON.stringify({ version: 99, kind: 'transitforge-savegame' }));
    expect('errors' in badVersion && badVersion.errors.length).toBeGreaterThan(0);
    const wrongKind = parseSaveGame(JSON.stringify({ version: 2, kind: 'other-app' }));
    expect('errors' in wrongKind).toBe(true);
    const missingOps = parseSaveGame(JSON.stringify({ ...blankSave('x', 1), ops: 'nope' }));
    expect('errors' in missingOps).toBe(true);
    expect(validateSaveGame(null)).toEqual(['File is not a JSON object.']);
  });

  it('migrates v1 scenarios losslessly', () => {
    const v1 = { version: 1 as const, id: 'sc-1', name: 'Old', seed: 1337, ops: [], updatedAt: 5 };
    const migrated = migrateScenarioV1(v1);
    expect(migrated?.name).toBe('Old');
    expect(migrated?.tick).toBe(0);
    expect(migrated?.scenarioId).toBe('sc-1');
    const viaFile = parseSaveGame(JSON.stringify({ version: 1, scenario: v1 }));
    expect('save' in viaFile).toBe(true);
    if ('save' in viaFile) expect(viaFile.warnings.length).toBe(1);
    expect(migrateScenarioV1({ version: 1, id: 'x', name: 'x', seed: 1, ops: 'bad', updatedAt: 0 } as never)).toBeNull();
  });

  it('sanitizes fares on import', () => {
    const raw = JSON.stringify({ ...blankSave('x', 1), fares: { metro: 999, rail: -4, bus: 3 } });
    const parsed = parseSaveGame(raw);
    if ('save' in parsed) expect(parsed.save.fares).toEqual({ metro: 50, rail: 0, bus: 3 });
    else throw new Error('should parse');
  });

  it('suggests safe filenames', () => {
    expect(saveFileName('Harbor Fix 2!')).toBe('harbor-fix-2.tfscenario.json');
    expect(saveFileName('')).toBe('scenario.tfscenario.json');
  });
});
