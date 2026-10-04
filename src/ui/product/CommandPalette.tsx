import { useMemo, useRef, useState } from 'react';
import { filterCommands, type CommandDef } from './commands.ts';

interface Props {
  commands: CommandDef[];
  onRun: (id: string) => void;
  onClose: () => void;
}

/** Ctrl+K searchable command list. Full keyboard operation, no mouse needed. */
export default function CommandPalette({ commands, onRun, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => filterCommands(commands, query), [commands, query]);
  const clamped = results.length === 0 ? 0 : Math.min(cursor, results.length - 1);

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
              run(results[clamped].id);
            } else if (e.key === 'Escape') {
              onClose();
            }
          }}
        />
        <ul className="tf-palette-list" role="listbox" aria-label="Commands">
          {results.length === 0 && (
            <li className="tf-palette-empty">
              No commands match “{query}”. Try “save”, “overlay”, or “tutorial”.
            </li>
          )}
          {results.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === clamped}>
              <button
                type="button"
                className={`tf-palette-item${i === clamped ? ' cursor' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => run(c.id)}
              >
                <span className="tf-hint">{c.section}</span>
                <span>{c.title}</span>
                {c.shortcut && <kbd>{c.shortcut}</kbd>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
