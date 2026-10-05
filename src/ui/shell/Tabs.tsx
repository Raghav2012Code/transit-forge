import { useEffect, useRef } from 'react';

/**
 * A tablist that scopes one surface to the job in hand.
 *
 * Follows the standard keyboard pattern: arrows move between tabs, Home and
 * End jump to the ends, and only the selected tab sits in the Tab sequence so
 * the strip costs one stop on the way to its panel. Only the open panel is
 * mounted, so only the selected tab carries aria-controls; the others would
 * point at an id that is not in the document.
 *
 * `idPrefix` names the ids (`${idPrefix}tab-x`, `${idPrefix}panel-x`) so two
 * tablists can live on one page.
 */
export interface TabItem<T extends string> {
  id: T;
  label: string;
}

export default function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
  idPrefix,
  className = 'tf-tabs',
}: {
  tabs: readonly TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  label: string;
  idPrefix: string;
  className?: string;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  // Focus after the render that actually selects the tab, so we never reach
  // for a node from the previous render.
  const focusWanted = useRef(false);

  useEffect(() => {
    if (!focusWanted.current) return;
    focusWanted.current = false;
    stripRef.current?.querySelector<HTMLButtonElement>(`#${idPrefix}tab-${active}`)?.focus();
  }, [active, idPrefix]);

  const go = (index: number) => {
    focusWanted.current = true;
    onChange(tabs[(index + tabs.length) % tabs.length].id);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === active);
    if (i < 0) return;
    switch (e.key) {
      case 'ArrowRight': go(i + 1); break;
      case 'ArrowLeft': go(i - 1); break;
      case 'Home': go(0); break;
      case 'End': go(tabs.length - 1); break;
      default: return;
    }
    e.preventDefault();
  };

  return (
    <div className={className} role="tablist" aria-label={label} ref={stripRef} onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`${idPrefix}tab-${t.id}`}
          aria-selected={active === t.id}
          aria-controls={active === t.id ? `${idPrefix}panel-${t.id}` : undefined}
          tabIndex={active === t.id ? 0 : -1}
          className="tf-tab"
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
