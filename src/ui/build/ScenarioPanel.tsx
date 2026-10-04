import { useState } from 'react';
import type { Scenario } from '../../simulation/scenario/scenario.ts';

interface Props {
  name: string;
  onName: (n: string) => void;
  onSave: () => void;
  saved: Scenario[];
  onLoad: (s: Scenario) => void;
  onRename: (s: Scenario, name: string) => void;
  onDuplicate: (s: Scenario) => void;
  onDelete: (id: string) => void;
}

export default function ScenarioPanel({ name, onName, onSave, saved, onLoad, onRename, onDuplicate, onDelete }: Props) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  return (
    <div className="tf-scenario">
      <h3>Scenario</h3>
      <label className="tf-namelabel">
        Name
        <input value={name} onChange={(e) => onName(e.target.value)} maxLength={48} />
      </label>
      <button type="button" className="tf-btn small" onClick={onSave}>Save scenario</button>
      {saved.length > 0 && (
        <ul className="tf-scenario-list">
          {saved.map((s) => (
            <li key={s.id}>
              {renaming === s.id ? (
                <span className="tf-scenario-row">
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    maxLength={48}
                  />
                  <button
                    type="button"
                    className="tf-btn small"
                    onClick={() => { onRename(s, renameValue || s.name); setRenaming(null); }}
                  >
                    OK
                  </button>
                </span>
              ) : (
                <span className="tf-scenario-row">
                  <button type="button" className="tf-link" onClick={() => onLoad(s)} title="Load">
                    {s.name} ({s.ops.length})
                  </button>
                  <span className="tf-scenario-ops">
                    <button type="button" className="tf-btn small" onClick={() => { setRenaming(s.id); setRenameValue(s.name); }}>Rename</button>
                    <button type="button" className="tf-btn small" onClick={() => onDuplicate(s)}>Copy</button>
                    <button type="button" className="tf-btn small" onClick={() => onDelete(s.id)}>Del</button>
                  </span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
