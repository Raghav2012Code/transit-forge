import type { ReactNode } from 'react';
import type { PresetId, TiltName } from '../../rendering/map/camera.ts';
import type { CameraInfo } from '../../rendering/SceneView.tsx';
import { IconFocus, IconMapFold, IconMinus, IconPlus, IconStationPin } from '../shell/icons.tsx';
import Popover from '../shell/Popover.tsx';

const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'overview', label: 'City overview' },
  { id: 'cbd', label: 'CBD' },
  { id: 'central', label: 'Central Interchange' },
  { id: 'airport', label: 'Airport' },
  { id: 'university', label: 'University' },
  { id: 'harbor', label: 'Harbor' },
  { id: 'industrial', label: 'Industrial area' },
];

const TILTS: { id: TiltName; label: string; title: string }[] = [
  { id: 'perspective', label: '3D', title: 'Perspective view' },
  { id: 'top', label: 'Plan', title: 'Top-down view' },
  { id: 'street', label: 'Street', title: 'Street-level view' },
];

/** One notch of the zoom buttons: a quarter of the way in or out. */
export const ZOOM_STEP = 0.75;

interface Props {
  cam: CameraInfo | null;
  tilt: TiltName;
  onTilt: (t: TiltName) => void;
  onPreset: (id: PresetId) => void;
  onReset: () => void;
  onFocusSelection: () => void;
  canFocus: boolean;
  onZoom: (factor: number) => void;
  minimapOpen: boolean;
  onMinimap: () => void;
  minimap: ReactNode;
}

/**
 * Everything that moves the camera, in one corner: the overview map, the view
 * (3D, plan, street), and a column of square buttons for north, zoom, focus,
 * named places and the overview toggle.
 */
export default function MapControls(p: Props) {
  const azimuth = p.cam ? Math.atan2(p.cam.pos[0] - p.cam.target[0], p.cam.pos[2] - p.cam.target[2]) : 0;
  const deg = Math.round((azimuth * 180) / Math.PI);
  return (
    <div className="tf-map-br">
      {p.minimapOpen && p.minimap}
      <div className="tf-seg tf-tilt" role="radiogroup" aria-label="Camera view">
        {TILTS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={p.tilt === t.id}
            className="tf-seg-item"
            title={t.title}
            onClick={() => p.onTilt(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="tf-mapctl" role="toolbar" aria-label="Map camera">
        <button type="button" className="tf-mapctl-btn" onClick={p.onReset} title={`Reset view (0). Camera is ${Math.abs(deg)}° off north.`} aria-label="Reset view">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" style={{ transform: `rotate(${deg}deg)` }}>
            <path d="M8 1.6 11.2 9H4.8Z" fill="currentColor" stroke="none" />
            <path d="M8 11.2v3.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
          </svg>
        </button>
        <button type="button" className="tf-mapctl-btn" onClick={() => p.onZoom(ZOOM_STEP)} title="Zoom in" aria-label="Zoom in">
          <IconPlus />
        </button>
        <button type="button" className="tf-mapctl-btn" onClick={() => p.onZoom(1 / ZOOM_STEP)} title="Zoom out" aria-label="Zoom out">
          <IconMinus />
        </button>
        <button
          type="button"
          className="tf-mapctl-btn"
          onClick={p.onFocusSelection}
          disabled={!p.canFocus}
          title="Focus the selection (F)"
          aria-label="Focus the selection"
        >
          <IconFocus />
        </button>
        <Popover
          label="Jump to a place"
          align="end"
          placement="above"
          className="tf-places"
          trigger={(props, open) => (
            <button type="button" className={`tf-mapctl-btn${open ? ' open' : ''}`} title="Jump to a place" aria-label="Jump to a place" {...props}>
              <IconStationPin />
            </button>
          )}
        >
          {(close) => (
            <ul className="tf-places-list">
              {PRESETS.map((pr) => (
                <li key={pr.id}>
                  <button
                    type="button"
                    className="tf-places-item"
                    onClick={() => {
                      p.onPreset(pr.id);
                      close();
                    }}
                  >
                    {pr.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Popover>
        <button
          type="button"
          className="tf-mapctl-btn"
          aria-pressed={p.minimapOpen}
          onClick={p.onMinimap}
          title="Overview map"
          aria-label="Overview map"
        >
          <IconMapFold />
        </button>
      </div>
    </div>
  );
}
