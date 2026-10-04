import { useMemo, useState } from 'react';
import { searchIndex, type SearchEntry } from '../../rendering/map/searchIndex.ts';

interface Props {
  entries: SearchEntry[];
  onPick: (e: SearchEntry) => void;
  onClose: () => void;
}

/** Spatial search: stations, routes, districts, roads. Pick focuses + inspects. */
export default function SearchPalette({ entries, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const results = useMemo(() => searchIndex(entries, query), [entries, query]);
  const clamped = results.length === 0 ? 0 : Math.min(cursor, results.length - 1);

  const run = (e: SearchEntry) => {
    onPick(e);
    onClose();
  };

  return (
    <div className="tf-modal-scrim tf-palette-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tf-palette" role="dialog" aria-modal="true" aria-label="Search map">
        <input
          value={query}
          placeholder="Search stations, routes, districts, roads… (/ to open)"
          aria-label="Map search"
          maxLength={64}
          autoFocus
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((c) => Math.min(results.length - 1, c + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === 'Enter' && results[clamped]) {
              run(results[clamped]);
            } else if (e.key === 'Escape') {
              onClose();
            }
          }}
        />
        <ul className="tf-palette-list" role="listbox" aria-label="Search results">
          {query.trim() !== '' && results.length === 0 && (
            <li className="tf-palette-empty">
              No places match “{query}”. Try “central”, “airport”, or “M1”.
            </li>
          )}
          {query.trim() === '' && (
            <li className="tf-palette-empty">Type to search the city — every result focuses the camera.</li>
          )}
          {results.map((r, i) => (
            <li key={`${r.kind}:${r.id}`} role="option" aria-selected={i === clamped}>
              <button
                type="button"
                className={`tf-palette-item${i === clamped ? ' cursor' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => run(r)}
              >
                <span className="tf-hint">{r.typeLabel}</span>
                <span>{r.name}</span>
                {r.metric && <kbd>{r.metric}</kbd>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
