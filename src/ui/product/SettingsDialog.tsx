import { APP_VERSION } from '../../version.ts';
import type { DefaultSpeed, MotionPref, Settings, UIScale } from './settings.ts';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  onResetData: () => void;
  onRestartTutorial: () => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
  onClose: () => void;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="tf-stat-row tf-setting-row">
      <dt>{label}{hint && <div className="tf-hint">{hint}</div>}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Compact settings: every control here changes something real. */
export default function SettingsDialog(p: Props) {
  const set = (patch: Partial<Settings>) => p.onChange({ ...p.settings, ...patch });
  return (
    <div className="tf-modal-scrim" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="tf-modal tf-modal-wide">
        <div className="tf-inspector-head">
          <h2>Settings</h2>
          <button type="button" className="tf-btn small" onClick={p.onClose}>Close</button>
        </div>

        <h3>Interface</h3>
        <Row label="Density" hint="Rail width and spacing">
          <select value={p.settings.uiScale} onChange={(e) => set({ uiScale: e.target.value as UIScale })} aria-label="Interface density">
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </Row>
        <Row label="Motion" hint="Animations and transitions">
          <select value={p.settings.motion} onChange={(e) => set({ motion: e.target.value as MotionPref })} aria-label="Motion preference">
            <option value="system">Follow system</option>
            <option value="reduced">Reduced</option>
            <option value="full">Full</option>
          </select>
        </Row>
        <Row label="High contrast" hint="Stronger text and edges">
          <input type="checkbox" checked={p.settings.highContrast} aria-label="High contrast" onChange={(e) => set({ highContrast: e.target.checked })} />
        </Row>

        <h3>Simulation</h3>
        <Row label="Default speed" hint="Used on launch and reset">
          <select value={p.settings.defaultSpeed} onChange={(e) => set({ defaultSpeed: Number(e.target.value) as DefaultSpeed })} aria-label="Default speed">
            <option value={1}>1×</option>
            <option value={5}>5×</option>
            <option value={20}>20×</option>
          </select>
        </Row>
        <Row label="City buildings" hint="3D blocks on load">
          <input type="checkbox" checked={p.settings.showBuildings} aria-label="Show buildings" onChange={(e) => set({ showBuildings: e.target.checked })} />
        </Row>

        <h3>Data</h3>
        <Row label="Autosave" hint="Saves edits in the background">
          <input type="checkbox" checked={p.settings.autosave} aria-label="Autosave" onChange={(e) => set({ autosave: e.target.checked })} />
        </Row>
        <Row label="Scenario file">
          <span className="tf-draft-actions">
            <button type="button" className="tf-btn small" onClick={p.onExport}>Export</button>
            <label className="tf-btn small" htmlFor="tf-settings-import">Import</label>
            <input
              id="tf-settings-import"
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) p.onImportFile(f);
                e.target.value = '';
              }}
            />
          </span>
        </Row>
        <Row label="Guided tutorial" hint="Replay the interactive tour">
          <button type="button" className="tf-btn small" onClick={p.onRestartTutorial}>Restart tutorial</button>
        </Row>
        <Row label="Local data" hint="Clears saves, plans, and preferences">
          <button type="button" className="tf-btn small danger" onClick={p.onResetData}>Reset all local data</button>
        </Row>

        <p className="tf-hint">TransitForge v{APP_VERSION} · save format v2 · fictional city · seed 1337</p>
      </div>
    </div>
  );
}
