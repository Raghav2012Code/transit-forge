import { useId, useMemo, useRef, useState } from 'react';
import { filterCommands, type CommandDef } from './commands.ts';

interface Props {
  commands: CommandDef[];
  onRun: (id: string) => void;
  onClose: () => void;
}

/**
 * Ctrl+K searchable command list. Full keyboard operation, no mouse needed.
 * Combobox + listbox with an active descendant, the same pattern as the map
 * search: the options are never tab stops, so the active row is announced.
 */
export default function CommandPalette({ commands, onRun, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const results = useMemo(() => filterCommands(commands, query), [commands, query]);
  const clamped = results.length === 0 ? 0 : Math.min(cursor, results.length - 1);
  const optionId = (id: string) => `${listId}-${id}`;
  const active = results[clamped];

  const run = (id: string) => {
    onRun(id);
    onClose();
  };

  return (
    <div className="tf-modal-scrim tf-palette-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tf-palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <input
          ref={inputRef}
          value={query}
          placeholder="Type a command… (Esc to close)"
          aria-label="Command search"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active ? optionId(active.id) : undefined}
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
            } else if (e.key === 'Enter' && active) {
              run(active.id);
            } else if (e.key === 'Escape') {
              onClose();
            }
          }}
        />
        <ul id={listId} className="tf-palette-list" role="listbox" aria-label="Commands">
          {results.length === 0 && (
            <li className="tf-palette-empty">
              No commands match “{query}”. Try “save”, “overlay”, or “tutorial”.
            </li>
          )}
          {results.map((c, i) => (
            <li
              key={c.id}
              id={optionId(c.id)}
              role="option"
              aria-selected={i === clamped}
              className={`tf-palette-item${i === clamped ? ' cursor' : ''}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => run(c.id)}
            >
              <span className="tf-hint">{c.section}</span>
              <span>{c.title}</span>
              {c.shortcut && <kbd>{c.shortcut}</kbd>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
