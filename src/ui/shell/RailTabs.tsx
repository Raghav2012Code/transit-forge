import { useEffect, useRef } from 'react';

/**
 * The rail is one column doing several jobs at once. Tabs scope it to the
 * job in hand, so reading the network never means scrolling past the fare
 * table to reach the growth forecast.
 *
 * Follows the standard tablist keyboard pattern: arrows move between tabs,
 * Home/End jump to the ends, and only the selected tab sits in the Tab
 * sequence so the strip costs one stop on the way to the panel. Only the
 * open panel is mounted, so only the selected tab carries aria-controls —
 * the others would otherwise point at an id that isn't in the document.
 */
export interface RailTab<T extends string> {
  id: T;
  label: string;
}

export default function RailTabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: readonly RailTab<T>[];
  active: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  // Focus after the render that actually selects the tab, so we never reach
  // for a node from the previous render — or one that has since unmounted
  // because the mode changed out from under the rail.
  const focusWanted = useRef(false);

  useEffect(() => {
    if (!focusWanted.current) return;
    focusWanted.current = false;
    stripRef.current?.querySelector<HTMLButtonElement>(`#railtab-${active}`)?.focus();
  }, [active]);

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
    <div
      className="tf-rail-tabs"
      role="tablist"
      aria-label={label}
      ref={stripRef}
      onKeyDown={onKeyDown}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`railtab-${t.id}`}
          aria-selected={active === t.id}
          aria-controls={active === t.id ? `railpanel-${t.id}` : undefined}
          tabIndex={active === t.id ? 0 : -1}
          className="tf-rail-tab"
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
