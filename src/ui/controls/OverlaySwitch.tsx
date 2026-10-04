import type { Overlay } from '../../rendering/SceneView.tsx';

const ITEMS: { key: Overlay; label: string }[] = [
  { key: 'normal', label: 'Normal' },
  { key: 'flow', label: 'Flow' },
  { key: 'load', label: 'Load' },
  { key: 'congestion', label: 'Congestion' },
];

export default function OverlaySwitch({ overlay, onChange }: { overlay: Overlay; onChange: (o: Overlay) => void }) {
  return (
    <div className="tf-layers">
      <h3>Overlay</h3>
      <div className="tf-speeds" role="group" aria-label="Visualization overlay">
        {ITEMS.map((it) => (
          <button
            key={it.key}
            type="button"
            className={`tf-btn small${overlay === it.key ? ' active' : ''}`}
            onClick={() => onChange(it.key)}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}
