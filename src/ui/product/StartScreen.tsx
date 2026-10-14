import { APP_VERSION } from '../../version.ts';
import { DEMOS } from '../../simulation/scenario/demos.ts';
import { networkThumbnail } from '../../simulation/scenario/thumbnail.ts';
import type { SaveGame } from '../../simulation/scenario/persistence.ts';
import type { CityData } from '../../types/index.ts';
import type { NetworkData } from '../../simulation/transport/network.ts';

export interface StartContinue {
  label: string;
  detail: string;
}

interface Props {
  continueTarget: StartContinue | null;
  recentSaves: SaveGame[];
  city: CityData;
  net: NetworkData;
  onContinue: () => void;
  onNew: () => void;
  onDemoCity: () => void;
  onDemo: (id: string) => void;
  onBrowse: () => void;
  onTutorial: () => void;
  onSettings: () => void;
  onAbout: () => void;
}

/** Launch screen: resume, start, or browse — never a cold simulator dump. */
export default function StartScreen(p: Props) {
  const thumb = networkThumbnail({ stations: p.net.stations, routes: p.net.routes, zones: p.city.zones });
  return (
    <div className="tf-start">
      <div className="tf-start-inner">
        <header className="tf-start-brand">
          <h1>TransitForge</h1>
          <p>Transport planning for a living city.</p>
        </header>

        <main className="tf-start-grid">
          <section className="tf-start-actions" aria-label="Primary actions">
            {p.continueTarget ? (
              <button type="button" className="tf-btn primary tf-start-big" onClick={p.onContinue} autoFocus>
                Continue
                <span className="tf-start-sub">{p.continueTarget.label} · {p.continueTarget.detail}</span>
              </button>
            ) : (
              <button type="button" className="tf-btn primary tf-start-big" onClick={p.onDemoCity} autoFocus>
                Explore Demo City
                <span className="tf-start-sub">No saved work yet — start with the living city</span>
              </button>
            )}
            <div className="tf-start-row">
              <button type="button" className="tf-btn tf-start-big" onClick={p.onNew}>
                New Planning Scenario
                <span className="tf-start-sub">Blank network, pick a brief</span>
              </button>
              {p.continueTarget && (
                <button type="button" className="tf-btn tf-start-big" onClick={p.onDemoCity}>
                  Explore Demo City
                  <span className="tf-start-sub">Guided tour of the sandbox</span>
                </button>
              )}
              <button type="button" className="tf-btn tf-start-big" onClick={p.onBrowse}>
                Load Scenario
                <span className="tf-start-sub">{p.recentSaves.length > 0 ? `${p.recentSaves.length} saved` : 'Browser, demos & import'}</span>
              </button>
            </div>
            <div className="tf-start-row secondary">
              <button type="button" className="tf-btn small" onClick={p.onTutorial}>Tutorial</button>
              <button type="button" className="tf-btn small" onClick={p.onSettings}>Settings</button>
              <button type="button" className="tf-btn small" onClick={p.onAbout}>About TransitForge</button>
            </div>
          </section>

          <section className="tf-start-side" aria-label="City preview and demos">
            <div className="tf-start-card">
              <h2>Demo city</h2>
              {/* Generated from live network data — always matches the sim. */}
              <div className="tf-thumb" dangerouslySetInnerHTML={{ __html: thumb }} />
              <p className="tf-hint">
                {p.city.zones.reduce((s, z) => s + z.population, 0).toLocaleString()} citizens ·
                {' '}{p.net.routes.length} lines · {p.net.stations.length} stations
              </p>
            </div>
            <div className="tf-start-card">
              <h2>Featured scenarios</h2>
              <ul className="tf-start-demos">
                {DEMOS.map((d) => (
                  <li key={d.id}>
                    <button type="button" className="tf-link" onClick={() => p.onDemo(d.id)}>
                      {d.title}
                    </button>
                    <span className="tf-hint"> · {d.difficulty} · ~{d.minutes} min</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </main>

        <footer className="tf-start-foot">
          <span className="tf-hint">TransitForge v{APP_VERSION} · fictional city · deterministic seed 1337</span>
        </footer>
      </div>
    </div>
  );
}
