import { useEffect, useRef, useState } from 'react';
import './App.css';
import SceneView, { type Layers, type Overlay, type Selection } from './rendering/SceneView.tsx';
import { createSimulation, stepSimulation, type SimulationState } from './simulation/index.ts';
import { computeStats } from './simulation/statistics.ts';
import SimControls, { type Speed } from './ui/controls/SimControls.tsx';
import LayerToggles from './ui/controls/LayerToggles.tsx';
import OverlaySwitch from './ui/controls/OverlaySwitch.tsx';
import StatsPanel from './ui/dashboard/StatsPanel.tsx';
import DebugPanel from './ui/dashboard/DebugPanel.tsx';
import Inspector from './ui/inspectors/Inspector.tsx';

const SEED = 1337;
const TICKS_PER_SEC: Record<Speed, number> = { 1: 2, 5: 8, 20: 24 };

export default function App() {
  // Live sim lives in a ref (advanced by the loop); panels render from a
  // throttled snapshot so React never re-renders at sim-step rate.
  const [snapshot, setSnapshot] = useState<SimulationState>(() => createSimulation(SEED));
  const simRef = useRef<SimulationState>(snapshot);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>(1);
  const [layers, setLayers] = useState<Layers>({ metro: true, rail: true, bus: true, roads: true, buildings: true });
  const [overlay, setOverlay] = useState<Overlay>('normal');
  const [selection, setSelection] = useState<Selection | null>(null);

  // Simulation loop: fixed 1-minute steps, decoupled from render rate.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastUi = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (playing) {
        acc += dt * TICKS_PER_SEC[speed];
        let n = Math.floor(acc);
        acc -= n;
        n = Math.min(n, 8); // avoid spiral after tab-switch
        for (let i = 0; i < n; i++) simRef.current = stepSimulation(simRef.current, 1);
        if (n > 0 && now - lastUi > 500) {
          lastUi = now;
          setSnapshot(simRef.current);
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  const stats = computeStats(snapshot);

  return (
    <div className="tf-root">
      <header className="tf-topbar">
        <div className="tf-brand">TransitForge</div>
        <SimControls
          playing={playing}
          speed={speed}
          tick={snapshot.tick}
          timeMinutes={snapshot.timeMinutes}
          onToggle={() => setPlaying((p) => !p)}
          onSpeed={(s) => setSpeed(s)}
          onReset={() => { simRef.current = createSimulation(SEED); setSnapshot(simRef.current); setSelection(null); }}
          onStep={() => { simRef.current = stepSimulation(simRef.current, 1); setSnapshot(simRef.current); }}
        />
      </header>
      <main className="tf-main">
        <section className="tf-viewport">
          <SceneView simRef={simRef} layers={layers} overlay={overlay} selection={selection} onSelect={setSelection} />
          <div className="tf-overlay-hint">drag orbit · right-drag pan · wheel zoom · click station/route/district</div>
        </section>
        <aside className="tf-panel">
          <LayerToggles layers={layers} onChange={setLayers} />
          <OverlaySwitch overlay={overlay} onChange={setOverlay} />
          <StatsPanel stats={stats} />
          <Inspector selection={selection} sim={snapshot} onClose={() => setSelection(null)} />
          <DebugPanel sim={snapshot} />
        </aside>
      </main>
    </div>
  );
}
