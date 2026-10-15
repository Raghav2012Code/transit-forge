import { APP_VERSION } from '../../version.ts';
import { DEMOS } from '../../simulation/scenario/demos.ts';
import { networkThumbnail } from '../../simulation/scenario/thumbnail.ts';
import { BrandMark } from '../shell/icons.tsx';
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

/** Launch desk: choose a working session, then inspect the city and briefs. */
export default function StartScreen(p: Props) {
  const thumb = networkThumbnail({ city: p.city, stations: p.net.stations, routes: p.net.routes });
  const citizens = p.city.zones.reduce((sum, z) => sum + z.population, 0);
  const savedLabel = p.recentSaves.length > 0 ? `${p.recentSaves.length} saved scenarios` : 'Demos and imports';

  return (
    <div className="tf-start">
      <div className="tf-start-inner">
        <header className="tf-start-masthead">
          <div className="tf-start-lockup">
            <span aria-hidden="true"><BrandMark size={26} /></span>
            <span className="tf-start-wordmark">TransitForge</span>
          </div>
          <nav className="tf-start-utility" aria-label="Help and settings">
            <button type="button" className="tf-start-link" onClick={p.onTutorial}>Tutorial</button>
            <button type="button" className="tf-start-link" onClick={p.onSettings}>Settings</button>
            <button type="button" className="tf-start-link" onClick={p.onAbout}>About</button>
          </nav>
        </header>

        <main>
          <section className="tf-start-hero" aria-labelledby="tf-start-title">
            <div className="tf-start-copy">
              <h1 id="tf-start-title">Plan a network.<br />Run the day.</h1>
              <p className="tf-start-lede">
                Build transit for a living city, run a simulated day, and see what your decisions change.
                Every figure comes from the simulation.
              </p>

              <div className="tf-start-actions" aria-label="Start or continue">
                {p.continueTarget ? (
                  <button type="button" className="tf-btn primary tf-start-primary" onClick={p.onContinue} autoFocus>
                    <span>Continue</span>
                    <span className="tf-start-primary-detail">
                      {p.continueTarget.label}, {p.continueTarget.detail}
                    </span>
                  </button>
                ) : (
                  <button type="button" className="tf-btn primary tf-start-primary" onClick={p.onDemoCity} autoFocus>
                    <span>Explore Demo City</span>
                    <span className="tf-start-primary-detail">A live city, ready to explore</span>
                  </button>
                )}

                <div className="tf-start-action-list">
                  <button type="button" className="tf-start-action" onClick={p.onNew}>
                    <span className="tf-start-action-name">New planning scenario</span>
                    <span className="tf-start-action-detail">Start with a blank network and a brief</span>
                  </button>
                  {p.continueTarget && (
                    <button type="button" className="tf-start-action" onClick={p.onDemoCity}>
                      <span className="tf-start-action-name">Explore Demo City</span>
                      <span className="tf-start-action-detail">A guided look at the live simulation</span>
                    </button>
                  )}
                  <button type="button" className="tf-start-action" onClick={p.onBrowse}>
                    <span className="tf-start-action-name">Open scenario library</span>
                    <span className="tf-start-action-detail">{savedLabel}</span>
                  </button>
                </div>
              </div>
            </div>

            <figure className="tf-start-figure">
              <div className="tf-start-map" dangerouslySetInnerHTML={{ __html: thumb }} />
              <figcaption>
                <span>{citizens.toLocaleString()} citizens</span>
                <span>{p.net.routes.length} lines</span>
                <span>{p.net.stations.length} stations</span>
                <span className="tf-start-figure-note">A plan of the city as the simulation holds it</span>
              </figcaption>
            </figure>
          </section>

          <section className="tf-start-scenarios" aria-labelledby="tf-start-scenarios-title">
            <div className="tf-start-section-head">
              <h2 id="tf-start-scenarios-title">Featured scenarios</h2>
              <span>Choose a brief to begin</span>
            </div>
            <div className="tf-start-table-wrap">
              <table className="tf-start-table">
                <thead>
                  <tr>
                    <th scope="col">Scenario</th>
                    <th scope="col">Focus</th>
                    <th scope="col">Difficulty</th>
                    <th scope="col">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {DEMOS.map((d) => (
                    <tr key={d.id}>
                      <th scope="row">
                        <button type="button" className="tf-start-demo" onClick={() => p.onDemo(d.id)}>
                          {d.title}
                        </button>
                      </th>
                      <td>{d.systems.slice(0, 2).join(', ')}</td>
                      <td>{d.difficulty}</td>
                      <td>~{d.minutes} min</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
