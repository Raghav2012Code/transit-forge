import type { Layers } from '../../rendering/SceneView.tsx';

interface Props {
  layers: Layers;
  onChange: (l: Layers) => void;
}

const ITEMS: { key: keyof Layers; label: string }[] = [
  { key: 'metro', label: 'Metro' },
  { key: 'rail', label: 'Rail' },
  { key: 'bus', label: 'Bus' },
  { key: 'roads', label: 'Roads' },
  { key: 'buildings', label: 'Buildings' },
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
              onChange={(e) => onChange({ ...layers, [it.key]: e.target.checked })}
            />
            {it.label}
          </label>
        ))}
      </div>
    </div>
  );
}
