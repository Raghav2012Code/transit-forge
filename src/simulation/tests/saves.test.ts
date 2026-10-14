import { describe, expect, it } from 'vitest';
import { blankSave } from '../scenario/persistence.ts';
import { deleteSave, duplicateSave, listSaves, renameSave, upsertSave } from '../scenario/saveStore.ts';
import { dropMeta, getMeta, markCompleted, orderRecent, toggleFavorite, touchOpened } from '../scenario/scenarioMeta.ts';

describe('save library', () => {
  it('stores saves without throwing when storage is unavailable', () => {
    expect(Array.isArray(listSaves())).toBe(true);
    const save = { ...blankSave('Lib Test', 1337), tick: 42 };
    upsertSave(save);
    const again = { ...save, name: 'Lib Test 2' };
    upsertSave(again);
    deleteSave(save.id);
  });

  it('duplicates and renames saves', () => {
    const save = blankSave('Original', 1337);
    const copy = duplicateSave(save);
    expect(copy.id).not.toBe(save.id);
    expect(copy.name).toContain('(copy)');
    expect(copy.ops).toEqual(save.ops);
    const renamed = renameSave(save, '  New Name  ');
    expect(renamed.name).toBe('New Name');
    expect(renameSave(save, '   ').name).toBe('Original');
    deleteSave(copy.id);
  });
});

describe('scenario metadata', () => {
  it('tracks favorites, completion, and recency without throwing', () => {
    expect(getMeta('nope').favorite).toBe(false);
    toggleFavorite('a');
    markCompleted('b');
    touchOpened('c', 37);
    dropMeta('a');
    dropMeta('b');
    dropMeta('c');
    if (typeof localStorage !== 'undefined') {
      const id = `t-${Date.now()}`;
      expect(toggleFavorite(id)).toBe(true);
      expect(toggleFavorite(id)).toBe(false);
      markCompleted(id);
      expect(getMeta(id).completedAt).not.toBeNull();
      expect(getMeta(id).progressPct).toBe(100);
      touchOpened(id, 37);
      expect(getMeta(id).progressPct).toBe(37);
      dropMeta(id);
      expect(getMeta(id).favorite).toBe(false);
    }
  });

  it('orders recent saves by last-opened time', () => {
    const older = { ...blankSave('Older', 1), savedAt: 100 };
    const newer = { ...blankSave('Newer', 1), savedAt: 200 };
    const ordered = orderRecent([older, newer]);
    expect(ordered[0].name).toBe('Newer');
    if (typeof localStorage !== 'undefined') {
      touchOpened(older.id, 10);
      expect(orderRecent([older, newer])[0].name).toBe('Older');
      dropMeta(older.id);
    }
  });
});
