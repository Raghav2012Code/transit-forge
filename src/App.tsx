import { useMemo, useState } from 'react';
import './App.css';
import SceneView from './rendering/SceneView.tsx';
import { createSimulation, stepSimulation } from './simulation/index.ts';

export default function App() {
  const [sim, setSim] = useState(() => createSimulation(1337));
  const clock = useMemo(() => {
    const h = Math.floor(sim.timeMinutes / 60);
    const m = Math.floor(sim.timeMinutes % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }, [sim.timeMinutes]);

  return (
    <div className="tf-root">
      <header className="tf-topbar">
        <div className="tf-brand">TransitForge</div>
        <div className="tf-meta">
          <span>seed {sim.seed}</span>
          <span>tick {sim.tick}</span>
          <span>{clock}</span>
        </div>
        <div className="tf-actions">
          <button type="button" onClick={() => setSim((s) => stepSimulation(s))}>
            Step +1m
          </button>
          <button type="button" onClick={() => setSim(createSimulation(1337))}>
            Reset
          </button>
        </div>
      </header>
      <main className="tf-main">
        <section className="tf-viewport">
          <SceneView />
        </section>
        <aside className="tf-panel">
          <h2>Scaffold online</h2>
          <p>
            Vite + React + Three.js is wired. Simulation, rendering, and UI are
            separated per architecture.
          </p>
          <ul>
            <li>
              <code>src/simulation</code> — pure TS
            </li>
            <li>
              <code>src/rendering</code> — Three.js only
            </li>
            <li>
              <code>src/ui</code> — React dashboard next
            </li>
          </ul>
          <p className="tf-hint">Next: seeded city + transport graph.</p>
        </aside>
      </main>
    </div>
  );
}
