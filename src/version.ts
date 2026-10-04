// Single source of truth for the visible app version and the scenario
// save-format version. The save version only increments when the SaveGame
// shape changes; migrations live next to the format.
export const APP_VERSION = '1.3.0';

/** Current SaveGame envelope version. v1 was ops-only (Scenario). */
export const SAVE_VERSION = 2;
