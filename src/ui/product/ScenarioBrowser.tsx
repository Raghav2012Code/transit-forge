import { useState } from 'react';
import { DEMOS, type DemoScenario } from '../../simulation/scenario/demos.ts';
import type { SaveGame } from '../../simulation/scenario/persistence.ts';
import { MAX_RECENT, orderRecent, type ScenarioMeta } from '../../simulation/scenario/scenarioMeta.ts';
import { ConfirmDialog, PromptDialog } from './Dialog.tsx';

export type BrowserTab = 'featured' | 'mine' | 'recent' | 'completed';

export interface DetailsBaseline {
  population: number;
  transitShare: number;
  congestion: number;
  travelMin: number;
  access: number;
  completed: number;
}

interface DetailsSel {
  kind: 'save' | 'demo';
  id: string;
}

interface Props {
  saves: SaveGame[];
  metaById: Record<string, ScenarioMeta>;
  thumbs: Record<string, string>;
  details: DetailsSel | null;
  baseline: DetailsBaseline | null;
  samplingBaseline: boolean;
  importErrors: string[] | null;
  initialTab?: BrowserTab;
  onSelectDetails: (d: DetailsSel | null) => void;
  onOpenSave: (id: string) => void;
  onOpenDemo: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onExportSave: (id: string) => void;
  onImportFile: (file: File) => void;
  onClearImportErrors: () => void;
  onClose: () => void;
}

function timeAgo(ts: number): string {
  if (!ts) return 'never';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

function Thumb({ svg, label }: { svg: string | undefined; label: string }) {
  if (!svg) return <div className="tf-thumb tf-thumb-empty" aria-label={`${label} preview unavailable`} />;
  return <div className="tf-thumb" role="img" aria-label={`${label} map preview`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export default function ScenarioBrowser(p: Props) {
  const [tab, setTab] = useState<BrowserTab>(p.initialTab ?? 'featured');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const recent = orderRecent(p.saves).slice(0, MAX_RECENT);
  const completed = p.saves.filter((s) => p.metaById[s.id]?.completedAt);
  const detailsSave = p.details?.kind === 'save' ? p.saves.find((s) => s.id === p.details.id) ?? null : null;
  const detailsDemo: DemoScenario | null =
    p.details?.kind === 'demo' ? (DEMOS.find((d) => d.id === p.details.id) ?? null) : null;

  const tabs: { key: BrowserTab; label: string }[] = [
    { key: 'featured', label: `Featured (${DEMOS.length})` },
    { key: 'mine', label: `My scenarios (${p.saves.length})` },
    { key: 'recent', label: `Recent (${recent.length})` },
    { key: 'completed', label: `Completed (${completed.length})` },
  ];

  return (
    <div className="tf-modal-scrim" role="dialog" aria-modal="true" aria-label="Scenario browser">
      <div className="tf-modal tf-browser">
        <div className="tf-inspector-head">
          <h2>Scenarios</h2>
          <div className="tf-draft-actions">
            <label className="tf-btn small" htmlFor="tf-browser-import">Import file</label>
            <input
              id="tf-browser-import"
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) p.onImportFile(f);
                e.target.value = '';
              }}
            />
            <button type="button" className="tf-btn small" onClick={p.onClose}>Close</button>
          </div>
        </div>

        {p.importErrors && (
          <div className="tf-import-errors" role="alert">
            <strong>Could not import that file — your current scenario is untouched.</strong>
            <ul>{p.importErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            <button type="button" className="tf-btn small" onClick={p.onClearImportErrors}>Dismiss</button>
          </div>
        )}

        <div className="tf-seg" role="tablist" aria-label="Scenario groups">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className="tf-seg-item"
              onClick={() => { setTab(t.key); p.onSelectDetails(null); }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="tf-browser-body">
          <div className="tf-browser-list">
            {tab === 'featured' && DEMOS.map((d) => (
              <article key={d.id} className={`tf-card${p.details?.id === d.id ? ' selected' : ''}`}>
                <button type="button" className="tf-card-main" onClick={() => p.onSelectDetails({ kind: 'demo', id: d.id })}>
                  <Thumb svg={p.thumbs[`demo:${d.id}`]} label={d.title} />
                  <div>
                    <strong>{d.title}</strong>
                    <div className="tf-hint">{d.difficulty} · ~{d.minutes} min · {d.systems.slice(0, 2).join(' · ')}</div>
                  </div>
                </button>
                <button type="button" className="tf-btn small primary" onClick={() => p.onOpenDemo(d.id)}>Start</button>
              </article>
            ))}

            {tab === 'mine' && p.saves.length === 0 && (
              <div className="tf-empty">
                <strong>No scenarios yet</strong>
                <p className="tf-hint">Build something in the sandbox, then save it — it will live here, in your browser, no account needed.</p>
                <button type="button" className="tf-btn small" onClick={p.onClose}>Back to the city</button>
              </div>
            )}
            {tab === 'mine' && p.saves.map((s) => {
              const meta = p.metaById[s.id];
              return (
                <article key={s.id} className={`tf-card${p.details?.id === s.id ? ' selected' : ''}`}>
                  <button type="button" className="tf-card-main" onClick={() => p.onSelectDetails({ kind: 'save', id: s.id })}>
                    <Thumb svg={p.thumbs[s.id]} label={s.name} />
                    <div>
                      <strong>{meta?.favorite ? '★ ' : ''}{s.name}</strong>
                      <div className="tf-hint">
                        {s.ops.length} edits · {s.tick > 0 ? `day at ${Math.floor(s.tick / 60) + 7}:00` : 'fresh morning'} · saved {timeAgo(s.savedAt)}
                      </div>
                    </div>
                  </button>
                  <div className="tf-card-actions">
                    <button type="button" className="tf-btn small primary" onClick={() => p.onOpenSave(s.id)}>Open</button>
                    <button type="button" className="tf-btn small" onClick={() => p.onToggleFavorite(s.id)} title="Favorite" aria-label="Favorite">
                      {meta?.favorite ? '★' : '☆'}
                    </button>
                    <button type="button" className="tf-btn small" onClick={() => p.onExportSave(s.id)}>Export</button>
                    <button type="button" className="tf-btn small" onClick={() => setRenaming(s.id)}>Rename</button>
                    <button type="button" className="tf-btn small" onClick={() => p.onDuplicate(s.id)}>Duplicate</button>
                    <button type="button" className="tf-btn small danger" onClick={() => setConfirmDelete(s.id)}>Delete</button>
                  </div>
                </article>
              );
            })}

            {tab === 'recent' && recent.length === 0 && (
              <div className="tf-empty">
                <strong>Nothing opened yet</strong>
                <p className="tf-hint">Scenarios you open appear here for one-click resume. Try a featured demo to begin.</p>
              </div>
            )}
            {tab === 'recent' && recent.map((s) => (
              <article key={s.id} className="tf-card">
                <button type="button" className="tf-card-main" onClick={() => p.onSelectDetails({ kind: 'save', id: s.id })}>
                  <Thumb svg={p.thumbs[s.id]} label={s.name} />
                  <div>
                    <strong>{s.name}</strong>
                    <div className="tf-hint">
                      Opened {timeAgo(p.metaById[s.id]?.lastOpenedAt ?? 0)}
                      {p.metaById[s.id]?.progressPct ? ` · ${p.metaById[s.id].progressPct}% objectives` : ''}
                      {p.metaById[s.id]?.completedAt ? ' · completed' : ''}
                    </div>
                  </div>
                </button>
                <button type="button" className="tf-btn small primary" onClick={() => p.onOpenSave(s.id)}>Resume</button>
              </article>
            ))}

            {tab === 'completed' && completed.length === 0 && (
              <div className="tf-empty">
                <strong>No completed plans yet</strong>
                <p className="tf-hint">Pass a plan evaluation in Planning mode and the scenario lands here with full marks.</p>
              </div>
            )}
            {tab === 'completed' && completed.map((s) => (
              <article key={s.id} className="tf-card">
                <button type="button" className="tf-card-main" onClick={() => p.onSelectDetails({ kind: 'save', id: s.id })}>
                  <Thumb svg={p.thumbs[s.id]} label={s.name} />
                  <div>
                    <strong>{s.name}</strong>
                    <div className="tf-hint">Completed {timeAgo(p.metaById[s.id]?.completedAt ?? 0)}</div>
                  </div>
                </button>
                <button type="button" className="tf-btn small primary" onClick={() => p.onOpenSave(s.id)}>Reopen</button>
              </article>
            ))}
          </div>

          <aside className="tf-browser-details" aria-label="Scenario details">
            {!p.details && (
              <div className="tf-empty">
                <strong>Scenario details</strong>
                <p className="tf-hint">Select any card to preview its network, objectives, and baseline before opening it.</p>
              </div>
            )}
            {detailsDemo && <DemoDetails demo={detailsDemo} thumb={p.thumbs[`demo:${detailsDemo.id}`]} onStart={() => p.onOpenDemo(detailsDemo.id)} />}
            {detailsSave && (
              <SaveDetails
                save={detailsSave}
                meta={p.metaById[detailsSave.id]}
                thumb={p.thumbs[detailsSave.id]}
                baseline={p.baseline}
                sampling={p.samplingBaseline}
                onOpen={() => p.onOpenSave(detailsSave.id)}
              />
            )}
          </aside>
        </div>

        {confirmDelete && (
          <ConfirmDialog
            title="Delete scenario?"
            body="This removes the saved scenario from this browser. Export it first if you might want it back."
            onConfirm={() => { p.onDelete(confirmDelete); setConfirmDelete(null); }}
            onCancel={() => setConfirmDelete(null)}
          />
        )}
        {renaming && (
          <PromptDialog
            title="Rename scenario"
            label="Name"
            initial={p.saves.find((s) => s.id === renaming)?.name ?? ''}
            confirmLabel="Rename"
            onConfirm={(name) => { p.onRename(renaming, name); setRenaming(null); }}
            onCancel={() => setRenaming(null)}
          />
        )}
      </div>
    </div>
  );
}

function DemoDetails({ demo, thumb, onStart }: { demo: DemoScenario; thumb: string | undefined; onStart: () => void }) {
  return (
    <div>
      <Thumb svg={thumb} label={demo.title} />
      <h3>{demo.title}</h3>
      <p className="tf-hint">{demo.difficulty} · ~{demo.minutes} min · {demo.growthYears > 0 ? `starts +${demo.growthYears}y` : 'present day'}</p>
      <p>{demo.description}</p>
      <h4>Demonstrates</h4>
      <p className="tf-hint">{demo.systems.join(' · ')}</p>
      <h4>Objectives</h4>
      <ul className="tf-ranked">
        {demo.objectives.map((o) => <li key={o.id}>{o.title}</li>)}
      </ul>
      <div className="tf-draft-actions">
        <button type="button" className="tf-btn small primary" onClick={onStart}>Start Scenario</button>
      </div>
    </div>
  );
}

function SaveDetails({ save, meta, thumb, baseline, sampling, onOpen }: {
  save: SaveGame;
  meta: ScenarioMeta | undefined;
  thumb: string | undefined;
  baseline: DetailsBaseline | null;
  sampling: boolean;
  onOpen: () => void;
}) {
  return (
    <div>
      <Thumb svg={thumb} label={save.name} />
      <h3>{save.name}</h3>
      <p className="tf-hint">
        {save.ops.length} edits · {save.tick > 0 ? `day at tick ${save.tick}` : 'fresh morning'}
        {save.yearsApplied > 0 ? ` · +${save.yearsApplied}y grown` : ''} · saved {timeAgo(save.savedAt)}
        {meta?.completedAt ? ' · completed' : ''}
      </p>
      <h4>Baseline sample</h4>
      {sampling && <p className="tf-hint">Running a 60-tick sample…</p>}
      {!sampling && baseline && (
        <dl>
          <div className="tf-stat-row"><dt>Population</dt><dd>{baseline.population.toLocaleString()}</dd></div>
          <div className="tf-stat-row"><dt>Transit share</dt><dd>{baseline.transitShare}%</dd></div>
          <div className="tf-stat-row"><dt>Congestion</dt><dd>{baseline.congestion}</dd></div>
          <div className="tf-stat-row"><dt>Avg travel</dt><dd>{baseline.travelMin} min</dd></div>
          <div className="tf-stat-row"><dt>Access score</dt><dd>{baseline.access}</dd></div>
          <div className="tf-stat-row"><dt>Trips done</dt><dd>{baseline.completed.toLocaleString()}</dd></div>
        </dl>
      )}
      {!sampling && !baseline && <p className="tf-hint">No baseline available for this save.</p>}
      <div className="tf-draft-actions">
        <button type="button" className="tf-btn small primary" onClick={onOpen}>Start Scenario</button>
      </div>
    </div>
  );
}
