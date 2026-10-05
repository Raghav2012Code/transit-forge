import type { RoadKind } from '../../simulation/scenario/scenario.ts';

export type BuildTool = 'metro' | 'station' | 'bus' | 'road' | 'delete' | 'extend';

export interface DraftInfo {
  stationCount: number;
  nodeCount: number;
  name: string;
  costPreview: string;
  canConfirm: boolean;
  confirmLabel: string;
  hint: string;
  pendingDeleteLabel: string | null;
  pendingDeleteUsage: string | null;
  extendRouteName: string | null;
}

interface Props {
  tool: BuildTool;
  onTool: (t: BuildTool) => void;
  draft: DraftInfo;
  onName: (name: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  roadKind: RoadKind;
  onRoadKind: (k: RoadKind) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  opCount: number;
  scenarioCost: string;
  /** The workbench rail carries the tool picker; show it here only when it does not. */
  showTools?: boolean;
}

const TOOLS: { key: BuildTool; label: string }[] = [
  { key: 'metro', label: 'Metro' },
  { key: 'station', label: 'Station' },
  { key: 'bus', label: 'Bus' },
  { key: 'road', label: 'Road' },
  { key: 'extend', label: 'Extend' },
  { key: 'delete', label: 'Delete' },
];

export default function BuildPanel(p: Props) {
  return (
    <div className="tf-build">
      <h3>Build</h3>
      {p.showTools !== false && (
        <div className="tf-tool-grid" role="group" aria-label="Build tools" data-tour="build-tools">
          {TOOLS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`tf-btn small${p.tool === t.key ? ' active' : ''}`}
              onClick={() => p.onTool(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      <p className="tf-hint">{p.draft.hint}</p>
      {p.tool === 'road' && (
        <div className="tf-speeds" role="group" aria-label="Road type">
          {(['local', 'arterial', 'highway'] as RoadKind[]).map((k) => (
            <button
              key={k}
              type="button"
              className={`tf-btn small${p.roadKind === k ? ' active' : ''}`}
              onClick={() => p.onRoadKind(k)}
            >
              {k}
            </button>
          ))}
        </div>
      )}
      {(p.draft.stationCount > 0 || p.draft.nodeCount > 0 || p.draft.pendingDeleteLabel) && (
        <div className="tf-draft">
          {p.draft.extendRouteName && <div className="tf-stat-row"><dt>Route</dt><dd>{p.draft.extendRouteName}</dd></div>}
          {p.draft.stationCount > 0 && <div className="tf-stat-row"><dt>Stations</dt><dd>{p.draft.stationCount}</dd></div>}
          {p.draft.nodeCount > 0 && <div className="tf-stat-row"><dt>Nodes</dt><dd>{p.draft.nodeCount}</dd></div>}
          {p.draft.pendingDeleteLabel && (
            <div className="tf-stat-row"><dt>Remove</dt><dd>{p.draft.pendingDeleteLabel} ({p.draft.pendingDeleteUsage})</dd></div>
          )}
          {!p.draft.pendingDeleteLabel && (
            <label className="tf-namelabel">
              Name
              <input value={p.draft.name} onChange={(e) => p.onName(e.target.value)} maxLength={40} />
            </label>
          )}
          <div className="tf-stat-row"><dt>Cost</dt><dd>{p.draft.costPreview}</dd></div>
          <div className="tf-draft-actions">
            <button type="button" className="tf-btn small primary" disabled={!p.draft.canConfirm} onClick={p.onConfirm}>
              {p.draft.confirmLabel}
            </button>
            <button type="button" className="tf-btn small" onClick={p.onCancel}>Clear</button>
          </div>
        </div>
      )}
      <div className="tf-draft-actions">
        <button type="button" className="tf-btn small" disabled={!p.canUndo} onClick={p.onUndo}>Undo</button>
        <button type="button" className="tf-btn small" disabled={!p.canRedo} onClick={p.onRedo}>Redo</button>
        <span className="tf-hint">{p.opCount} edits, {p.scenarioCost}</span>
      </div>
    </div>
  );
}
