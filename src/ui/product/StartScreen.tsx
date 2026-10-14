import { APP_VERSION } from '../../version.ts';
import { DEMOS } from '../../simulation/scenario/demos.ts';
import { networkThumbnail } from '../../simulation/scenario/thumbnail.ts';
import { BrandMark } from '../shell/icons.tsx';
import type { SaveGame } from '../../simulation/scenario/persistence.ts';
import type { CityData } from '../../types/index.ts';
import type { NetworkData } from '../../simulation/transport/network.ts';
import type { Theme } from '../../rendering/palette.ts';

export interface StartContinue {
  label: string;
  detail: string;
}

interface Props {
  continueTarget: StartContinue | null;
  recentSaves: SaveGame[];
  city: CityData;
  net: NetworkData;
  theme: Theme;
  onContinue: () => void;
  onNew: () => void;
  onDemoCity: () => void;
  onDemo: (id: string) => void;
  onBrowse: () => void;
  onTutorial: () => void;
  onSettings: () => void;
  onAbout: () => void;
}

/**
 * The launch screen, set as a report page: the argument on the left, the city
 * itself on the right as a captioned figure, and the featured scenarios ruled
 * like the tables in a report. One committing action, quiet ranks behind it.
 */
export default function StartScreen(p: Props) {
  const thumb = networkThumbnail({ stations: p.net.stations, routes: p.net.routes, zones: p.city.zones }, p.theme);
  const citizens = p.city.zones.reduce((sum, z) => sum + z.population, 0);
  const savedLabel = p.recentSaves.length > 0 ? `${p.recentSaves.length} saved` : 'Browser, demos & import';

  return (
    <div className="tf-start">
      <div className="tf-start-inner">
        <header className="tf-start-head">
          <div className="tf-start-lockup">
            <span className="tf-start-mark" aria-hidden="true">
              <BrandMark size={32} />
            </span>
            <h1>TransitForge</h1>
          </div>
          <p className="tf-start-lede">
            A fictional coastal city with six transit lines and a full day of travel demand.
            Build the network, run the day, break it, and plan against objectives.
            Every figure traces back to the simulation.
          </p>
        </header>

        <main className="tf-start-grid">
          <section className="tf-start-actions" aria-label="Start">
            {p.continueTarget ? (
              <button type="button" className="tf-btn primary tf-start-go" onClick={p.onContinue} autoFocus>
                <span>Continue</span>
                <span className="tf-start-go-sub">{p.continueTarget.label}, {p.continueTarget.detail}</span>
              </button>
            ) : (
              <button type="button" className="tf-btn primary tf-start-go" onClick={p.onDemoCity} autoFocus>
                <span>Explore Demo City</span>
                <span className="tf-start-go-sub">No saved work yet — start with the living city</span>
              </button>
            )}

            <div className="tf-start-quiet-block">
              <button type="button" className="tf-btn tf-start-go" onClick={p.onNew}>
                <span>New Planning Scenario</span>
                <span className="tf-start-go-sub">Blank network, pick a brief</span>
              </button>
              {p.continueTarget && (
                <button type="button" className="tf-btn tf-start-go" onClick={p.onDemoCity}>
                  <span>Explore Demo City</span>
                  <span className="tf-start-go-sub">Guided tour of the sandbox</span>
                </button>
              )}
              <button type="button" className="tf-btn tf-start-go" onClick={p.onBrowse}>
                <span>Load Scenario</span>
                <span className="tf-start-go-sub">{savedLabel}</span>
              </button>
            </div>

            <div className="tf-start-links">
              <button type="button" className="tf-start-link" onClick={p.onTutorial}>Tutorial</button>
              <button type="button" className="tf-start-link" onClick={p.onSettings}>Settings</button>
              <button type="button" className="tf-start-link" onClick={p.onAbout}>About TransitForge</button>
            </div>
          </section>

          <section className="tf-start-side" aria-label="The city and its scenarios">
            {/* Generated from live network data, so the figure always matches the simulation. */}
            <figure className="tf-start-plate">
              <div className="tf-start-plate-img" dangerouslySetInnerHTML={{ __html: thumb }} />
              <figcaption>
                {citizens.toLocaleString()} citizens, {p.net.routes.length} lines, {p.net.stations.length} stations.
                The network as the simulation holds it.
              </figcaption>
            </figure>

            <section className="tf-start-scenarios" aria-label="Featured scenarios">
              <h2>Featured scenarios</h2>
              <ul className="tf-start-demos">
                {DEMOS.map((d) => (
                  <li key={d.id}>
                    <button type="button" className="tf-start-demo" onClick={() => p.onDemo(d.id)}>
                      <span className="tf-start-demo-name">{d.title}</span>
                      <span className="tf-start-demo-diff">{d.difficulty}</span>
                      <span className="tf-start-demo-min">~{d.minutes} min</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </section>
        </main>

        <footer className="tf-start-foot">
          <span>TransitForge v{APP_VERSION}</span>
          <span>Fictional city, deterministic seed 1337</span>
        </footer>
      </div>
    </div>
  );
}
