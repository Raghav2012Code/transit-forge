import { useId, useMemo, useState } from 'react';
import { searchIndex, type SearchEntry } from '../../rendering/map/searchIndex.ts';
import { rankCommands, type Command } from '../shell/commands.ts';

interface Props {
  entries: SearchEntry[];
  commands: Command[];
  onPick: (e: SearchEntry) => void;
  onClose: () => void;
}

type Row =
  | { type: 'command'; key: string; command: Command }
  | { type: 'place'; key: string; entry: SearchEntry };

/**
 * One box for the whole workspace. Type a place and the camera goes there;
 * type what you want to do and it happens. Commands lead because a verb is
 * usually the shorter thing to type.
 */
export default function SearchPalette({ entries, commands, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const listId = useId();

  const rows = useMemo<Row[]>(() => {
    const cmds = rankCommands(commands, query, 6).map<Row>((c) => ({ type: 'command', key: `c:${c.id}`, command: c }));
    const places = searchIndex(entries, query, 6).map<Row>((e) => ({ type: 'place', key: `p:${e.kind}:${e.id}`, entry: e }));
    return [...cmds, ...places];
  }, [commands, entries, query]);
  const clamped = rows.length === 0 ? 0 : Math.min(cursor, rows.length - 1);
  const typed = query.trim() !== '';

  const run = (row: Row) => {
    onClose();
    if (row.type === 'command') row.command.run();
    else onPick(row.entry);
  };

  const firstPlace = rows.findIndex((r) => r.type === 'place');

  return (
    <div className="tf-modal-scrim tf-palette-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tf-palette" role="dialog" aria-modal="true" aria-label="Search and commands">
        <input
          value={query}
          placeholder="Search the map or run a command"
          aria-label="Search the map or run a command"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={rows[clamped] ? `${listId}-${clamped}` : undefined}
          maxLength={64}
          autoFocus
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((c) => Math.min(rows.length - 1, c + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === 'Enter' && rows[clamped]) {
              run(rows[clamped]);
            } else if (e.key === 'Escape') {
              onClose();
            }
          }}
        />
        <ul className="tf-palette-list" role="listbox" id={listId} aria-label="Results">
          {typed && rows.length === 0 && (
            <li className="tf-palette-empty" role="presentation">
              Nothing matches “{query}”. Try “central”, “dark”, “build” or “crowding”.
            </li>
          )}
          {!typed && (
            <li className="tf-palette-empty" role="presentation">
              Type a place to fly there, or an action to run it. These are a few to start with.
            </li>
          )}
          {rows.map((row, i) => (
            <li key={row.key} role="presentation">
              {i === 0 && row.type === 'command' && <div className="tf-palette-group" aria-hidden="true">Commands</div>}
              {i === firstPlace && <div className="tf-palette-group" aria-hidden="true">Places</div>}
              <button
                type="button"
                role="option"
                id={`${listId}-${i}`}
                aria-selected={i === clamped}
                tabIndex={-1}
                className={`tf-palette-item${i === clamped ? ' cursor' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => run(row)}
              >
                {row.type === 'command' ? (
                  <>
                    <span className="tf-hint">{row.command.group}</span>
                    <span>{row.command.label}</span>
                    {row.command.keys && (
                      <span className="tf-palette-keys">{row.command.keys.map((k) => <kbd key={k}>{k}</kbd>)}</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="tf-hint">{row.entry.typeLabel}</span>
                    <span>{row.entry.name}</span>
                    {row.entry.metric && <kbd>{row.entry.metric}</kbd>}
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
