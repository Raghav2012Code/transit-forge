import type { Layers } from '../../rendering/SceneView.tsx';

interface Props {
  layers: Layers;
  onChange: (l: Layers) => void;
}

const GROUPS: { title: string; items: { key: keyof Layers; label: string; color: string; hint: string }[] }[] = [
  {
    title: 'Base',
    items: [
      { key: 'roads', label: 'Roads', color: 'var(--mode-road)', hint: 'Road network and bridges' },
      { key: 'buildings', label: 'Buildings', color: 'var(--faint)', hint: 'City blocks' },
      { key: 'labels', label: 'Labels', color: 'var(--signal)', hint: 'Map labels by zoom' },
    ],
  },
  {
    title: 'Transit',
    items: [
      { key: 'metro', label: 'Metro', color: 'var(--mode-metro)', hint: 'Metro lines and stations' },
      { key: 'rail', label: 'Rail', color: 'var(--mode-rail)', hint: 'Rail lines and stations' },
      { key: 'bus', label: 'Bus', color: 'var(--mode-bus)', hint: 'Bus routes' },
      { key: 'vehicles', label: 'Vehicles', color: 'var(--good)', hint: 'Moving vehicles' },
    ],
  },
  {
    title: 'Planning',
    items: [
      { key: 'problems', label: 'Problems', color: 'var(--bad)', hint: 'Planning problem markers' },
    ],
  },
];

/** Compact layer manager (§30). Preferences persist via the App shell. */
export default function LayerToggles({ layers, onChange }: Props) {
  return (
    <div className="tf-layers">
      <h3>Layers</h3>
      {GROUPS.map((g) => (
        <div key={g.title} className="tf-layer-group">
          <span className="tf-hint">{g.title}</span>
          <div className="tf-layer-row">
            {g.items.map((it) => (
              <label key={it.key} className="tf-check" title={it.hint}>
                <input
                  type="checkbox"
                  checked={layers[it.key]}
                  aria-label={it.label}
                  onChange={(e) => onChange({ ...layers, [it.key]: e.target.checked })}
                />
                <span className="tf-seg-dot" style={{ background: layers[it.key] ? it.color : undefined }} />
                {it.label}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
