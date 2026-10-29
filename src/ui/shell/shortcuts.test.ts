import { describe, expect, it } from 'vitest';
import { SHORTCUT_GROUPS } from './shortcuts.ts';

const items = SHORTCUT_GROUPS.flatMap((g) => g.items);

describe('shortcut sheet', () => {
  it('documents the Home alias of the reset-view shortcut', () => {
    const reset = items.find(([, does]) => does === 'Reset the view');
    expect(reset?.[0]).toEqual(['0', 'Home']);
  });

  it('gives every listed action at least one key and a unique binding', () => {
    const combos = items.map(([keys]) => keys.join('+'));
    expect(new Set(combos).size).toBe(combos.length);
    for (const [keys, does] of items) {
      expect(keys.length).toBeGreaterThan(0);
      expect(does.trim().length).toBeGreaterThan(0);
    }
  });
});
