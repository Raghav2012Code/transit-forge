/** A labelled single-choice group drawn as a segmented control. */
export default function Seg<T extends string>({
  label,
  items,
  active,
  onPick,
  wrap = true,
}: {
  label: string;
  items: { key: T; label: string }[];
  active: T;
  onPick: (k: T) => void;
  /** Three columns that wrap, for long lists; off for a single compact row. */
  wrap?: boolean;
}) {
  return (
    <div className="tf-overlay-group">
      <span className="tf-overlay-group-label">{label}</span>
      <div className={`tf-seg${wrap ? ' wrap' : ''}`} role="radiogroup" aria-label={label}>
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            role="radio"
            aria-checked={active === it.key}
            className="tf-seg-item"
            onClick={() => onPick(it.key)}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}
