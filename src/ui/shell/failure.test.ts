import { describe, expect, it } from 'vitest';
import { clearSavedData, describeFailure } from './failure.ts';

function fakeStorage(entries: Record<string, string>) {
  const data = new Map(Object.entries(entries));
  return {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => { data.delete(k); },
    keys: () => [...data.keys()],
  };
}

describe('describeFailure', () => {
  it('names a WebGL failure in words', () => {
    const f = describeFailure(new Error('Error creating WebGL context.'));
    expect(f.kind).toBe('webgl');
    expect(f.title).toMatch(/cannot draw/i);
  });

  it('passes any other error through as a crash', () => {
    const f = describeFailure(new Error('boom'));
    expect(f).toMatchObject({ kind: 'crash', detail: 'boom' });
  });

  it('copes with a thrown string', () => {
    expect(describeFailure('plain').detail).toBe('plain');
  });
});

describe('clearSavedData', () => {
  it("removes only this app's keys", () => {
    const s = fakeStorage({ 'transitforge.theme': 'dark', 'transitforge.plans.v1': '{}', other: 'keep' });
    expect(clearSavedData(s)).toBe(2);
    expect(s.keys()).toEqual(['other']);
  });

  it('does nothing on empty storage', () => {
    expect(clearSavedData(fakeStorage({}))).toBe(0);
  });
});
