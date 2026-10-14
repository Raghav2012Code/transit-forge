// Browser-local storage, the one place that tolerates a hostile environment.
// A blocked or full store must never throw into a caller: reads fall back and
// writes report failure, so a surface degrades to session-local instead of
// breaking. Lives on its own because every store in the simulation layer uses it.
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
