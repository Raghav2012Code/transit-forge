// User settings. Only real, working options are exposed — every field here
// is applied by the App shell on load and on change (see settingsToDom).
// Storage failures degrade to defaults; nothing here ever throws.
export type UIScale = 'compact' | 'comfortable';
export type MotionPref = 'system' | 'reduced' | 'full';
export type DefaultSpeed = 1 | 5 | 20;

export interface Settings {
  uiScale: UIScale;
  motion: MotionPref;
  highContrast: boolean;
  defaultSpeed: DefaultSpeed;
  showBuildings: boolean;
  autosave: boolean;
}

const KEY = 'transitforge.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  uiScale: 'comfortable',
  motion: 'system',
  highContrast: false,
  defaultSpeed: 1,
  showBuildings: true,
  autosave: true,
};

function isSpeed(v: unknown): v is DefaultSpeed {
  return v === 1 || v === 5 || v === 20;
}

/** Merge partial/stored values over defaults, dropping anything invalid. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  return {
    uiScale: r.uiScale === 'compact' || r.uiScale === 'comfortable' ? r.uiScale : DEFAULT_SETTINGS.uiScale,
    motion: r.motion === 'reduced' || r.motion === 'full' || r.motion === 'system' ? r.motion : DEFAULT_SETTINGS.motion,
    highContrast: typeof r.highContrast === 'boolean' ? r.highContrast : DEFAULT_SETTINGS.highContrast,
    defaultSpeed: isSpeed(r.defaultSpeed) ? r.defaultSpeed : DEFAULT_SETTINGS.defaultSpeed,
    showBuildings: typeof r.showBuildings === 'boolean' ? r.showBuildings : DEFAULT_SETTINGS.showBuildings,
    autosave: typeof r.autosave === 'boolean' ? r.autosave : DEFAULT_SETTINGS.autosave,
  };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return sanitizeSettings(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(sanitizeSettings(s)));
  } catch {
    // Unavailable: settings apply for this session only.
  }
}

/** DOM attributes the shell sets from settings (tested mapping, no DOM here). */
export function settingsToDom(s: Settings): { uiScale: UIScale; motion: MotionPref; contrast: 'high' | 'normal' } {
  return { uiScale: s.uiScale, motion: s.motion, contrast: s.highContrast ? 'high' : 'normal' };
}
