import type { HoverInfo } from '../../rendering/SceneView.tsx';

export function HoverTooltip({ hover }: { hover: HoverInfo | null }) {
  if (!hover) return null;
  const flip = hover.x > window.innerWidth - 280;
  return (
    <div
      className="tf-hover-tip"
      style={{ left: hover.x + (flip ? -250 : 16), top: Math.max(8, hover.y - 10) }}
      role="status"
      aria-live="off"
    >
      <strong>{hover.name}</strong>
      <div className="tf-hint">{hover.type}</div>
      {hover.metric && <div className="tf-hover-metric">{hover.metric}</div>}
    </div>
  );
}

export interface ContextAction {
  label: string;
  danger?: boolean;
  run: () => void;
}

export function ContextMenu({ menu, onClose }: {
  menu: { x: number; y: number; title: string; actions: ContextAction[] } | null;
  onClose: () => void;
}) {
  if (!menu) return null;
  return (
    <div className="tf-modal-scrim tf-menu-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="tf-context-menu"
        role="menu"
        aria-label={menu.title}
        style={{
          left: Math.min(menu.x, window.innerWidth - 230),
          top: Math.min(menu.y, window.innerHeight - menu.actions.length * 36 - 60),
        }}
      >
        <div className="tf-context-title">{menu.title}</div>
        {menu.actions.map((a) => (
          <button
            key={a.label}
            type="button"
            role="menuitem"
            className={`tf-context-item${a.danger ? ' danger' : ''}`}
            onClick={() => {
              a.run();
              onClose();
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
