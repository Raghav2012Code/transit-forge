import type { Layers } from '../../rendering/SceneView.tsx';

interface Props {
  layers: Layers;
  onChange: (l: Layers) => void;
}

const ITEMS: { key: keyof Layers; label: string; color: string }[] = [
  { key: 'metro', label: 'Metro', color: 'var(--mode-metro)' },
  { key: 'rail', label: 'Rail', color: 'var(--mode-rail)' },
  { key: 'bus', label: 'Bus', color: 'var(--mode-bus)' },
  { key: 'roads', label: 'Roads', color: 'var(--mode-road)' },
  { key: 'buildings', label: 'Buildings', color: 'var(--faint)' },
];

export default function LayerToggles({ layers, onChange }: Props) {
  return (
    <div className="tf-layers">
      <h3>Layers</h3>
      <div className="tf-layer-row">
        {ITEMS.map((it) => (
          <label key={it.key} className="tf-check">
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
  );
}