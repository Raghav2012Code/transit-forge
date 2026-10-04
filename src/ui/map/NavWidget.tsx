import type { PresetId, TiltName } from '../../rendering/map/camera.ts';
import type { CameraInfo } from '../../rendering/SceneView.tsx';

const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'overview', label: 'City Overview' },
  { id: 'cbd', label: 'CBD' },
  { id: 'central', label: 'Central Interchange' },
  { id: 'airport', label: 'Airport' },
  { id: 'university', label: 'University' },
  { id: 'harbor', label: 'Harbor' },
  { id: 'industrial', label: 'Industrial Area' },
];

const TILTS: { id: TiltName; label: string }[] = [
  { id: 'perspective', label: 'Perspective' },
  { id: 'top', label: 'Top-down' },
  { id: 'street', label: 'Street' },
];

interface Props {
  cam: CameraInfo | null;
  tilt: TiltName;
  onTilt: (t: TiltName) => void;
  onPreset: (id: PresetId) => void;
  onReset: () => void;
  onFocusSelection: () => void;
  canFocus: boolean;
}

/** Orientation + camera presets + focus. North is -Z (up on the minimap). */
export default function NavWidget({ cam, tilt, onTilt, onPreset, onReset, onFocusSelection, canFocus }: Props) {
  const azimuth = cam ? Math.atan2(cam.pos[0] - cam.target[0], cam.pos[2] - cam.target[2]) : 0;
  const zoomPct = cam
    ? Math.round((1 - (cam.dist - 60) / (1000 - 60)) * 100)
    : 0;
  return (
    <div className="tf-nav" role="toolbar" aria-label="Map navigation">
      <div
        className="tf-compass"
        title={`North up · camera azimuth ${Math.round((azimuth * 180) / Math.PI)}°`}
        aria-label="North indicator"
      >
        <span style={{ transform: `rotate(${(azimuth * 180) / Math.PI}deg)` }}>N▲</span>
      </div>
      <div className="tf-nav-zoom" title="Zoom level">
        {zoomPct}%
      </div>
      <div className="tf-seg" role="group" aria-label="Camera tilt">
        {TILTS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tf-seg-item${tilt === t.id ? ' active' : ''}`}
            title={`${t.label} view`}
            onClick={() => onTilt(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <label className="tf-namelabel">
        <span className="tf-hint">Camera preset</span>
        <select
          aria-label="Camera preset"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) {
              onPreset(e.target.value as PresetId);
              e.target.value = '';
            }
          }}
        >
          <option value="">Jump to…</option>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </label>
      <div className="tf-draft-actions">
        <button type="button" className="tf-btn small" title="Reset view (Home)" onClick={onReset}>
          Reset View
        </button>
        <button type="button" className="tf-btn small" title="Focus selection (F)" onClick={onFocusSelection} disabled={!canFocus}>
          Focus Selection
        </button>
      </div>
    </div>
  );
}
