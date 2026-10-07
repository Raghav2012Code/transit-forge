/** A labelled single-choice group drawn as a segmented control. */
export default function Seg<T extends string>({
  label,
  items,
  active,
  onPick,
  wrap = true,
  bare = false,
  className = '',
}: {
  label: string;
  items: { key: T; label: string }[];
  active: T;
  onPick: (k: T) => void;
  /** Three columns that wrap, for long lists; off for a single compact row. */
  wrap?: boolean;
  /** Skip the group wrapper and visible label; the row keeps the label as its name. */
  bare?: boolean;
  /** Extra class on the row itself (e.g. a lens tint). */
  className?: string;
}) {
  const row = (
    <div className={`tf-seg${wrap ? ' wrap' : ''}${className ? ` ${className}` : ''}`} role="radiogroup" aria-label={label}>
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
  );
  if (bare) return row;
  return (
    <div className="tf-overlay-group">
      <span className="tf-overlay-group-label">{label}</span>
      {row}
    </div>
  );
}
