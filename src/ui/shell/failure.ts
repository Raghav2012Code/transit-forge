// What the fallback screen says, and how it clears saved data. Pure: storage is passed in.
export type FailureKind = 'webgl' | 'crash';

export interface Failure {
  kind: FailureKind;
  title: string;
  detail: string;
}

const PREFIX = 'transitforge.';

export function describeFailure(error: unknown): Failure {
  const message = error instanceof Error ? error.message : String(error);
  if (/webgl/i.test(message)) {
    return {
      kind: 'webgl',
      title: 'This browser cannot draw the 3D map',
      detail: 'TransitForge needs WebGL. Turn on hardware acceleration, or try a current Chrome, Edge, Firefox or Safari.',
    };
  }
  return { kind: 'crash', title: 'Something went wrong', detail: message };
}

/** Remove every key this app wrote. Returns how many were removed. */
export function clearSavedData(storage: Pick<Storage, 'length' | 'key' | 'removeItem'>): number {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith(PREFIX)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
  return keys.length;
}
