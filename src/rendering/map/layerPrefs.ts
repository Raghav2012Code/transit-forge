// Layer preferences: visibility state persisted across sessions.
// Storage failures fall back to defaults; nothing here ever throws.
export interface MapLayers {
  metro: boolean;
  rail: boolean;
  bus: boolean;
  roads: boolean;
  buildings: boolean;
  labels: boolean;
  vehicles: boolean;
  problems: boolean;
}

export const DEFAULT_LAYERS: MapLayers = {
  metro: true,
  rail: true,
  bus: true,
  roads: true,
  buildings: true,
  labels: true,
  vehicles: true,
  problems: true,
};

const KEY = 'transitforge.layers.v1';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Merge stored values over defaults, dropping anything unexpected. */
export function sanitizeLayers(raw: unknown): MapLayers {
  const out = { ...DEFAULT_LAYERS };
  if (!isRecord(raw)) return out;
  for (const k of Object.keys(DEFAULT_LAYERS) as (keyof MapLayers)[]) {
    if (typeof raw[k] === 'boolean') out[k] = raw[k];
  }
  return out;
}

export function loadLayers(): MapLayers {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_LAYERS };
    return sanitizeLayers(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_LAYERS };
  }
}

export function saveLayers(layers: MapLayers): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(sanitizeLayers(layers)));
  } catch {
    // Unavailable: preferences apply for this session only.
  }
}
