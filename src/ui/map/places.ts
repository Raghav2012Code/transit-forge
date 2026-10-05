import type { PresetId } from '../../rendering/map/camera.ts';

/** Named views of the city, as the camera menu and the command palette both offer them. */
export const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'overview', label: 'City overview' },
  { id: 'cbd', label: 'CBD' },
  { id: 'central', label: 'Central Interchange' },
  { id: 'airport', label: 'Airport' },
  { id: 'university', label: 'University' },
  { id: 'harbor', label: 'Harbor' },
  { id: 'industrial', label: 'Industrial area' },
];
