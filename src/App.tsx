import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import SceneView, { type AnalyticsView, type DraftView, type Layers, type Overlay, type Selection } from './rendering/SceneView.tsx';
import { generateCity } from './simulation/city/generateCity.ts';
import { createSimulation, createSimulationFromParts, stepSimulation, type SimulationState } from './simulation/index.ts';
import { computeAccessibility } from './simulation/analytics/accessibility.ts';
import { computeCoverage } from './simulation/analytics/coverage.ts';
import { findBottlenecks } from './simulation/analytics/bottlenecks.ts';
import { findTransitGaps } from './simulation/analytics/gaps.ts';
import { planningScore } from './simulation/analytics/impact.ts';
import { samplePoint, type SeriesPoint } from './simulation/analytics/series.ts';
import { applyEdits } from './simulation/scenario/applyEdits.ts';
import { compareScenarios } from './simulation/scenario/compare.ts';
import {
  createScenario,
  formatCost,
  nextRouteId,
  nextStationId,
  paletteColor,
  pushOp,
  redoOp,
  undoOp,
  validateRoadNode,
  validateStationPlacement,
  type EditOp,
  type RoadKind,
  type Scenario,
} from './simulation/scenario/scenario.ts';
import { deleteScenario, duplicateScenario, listScenarios, saveScenario } from './simulation/scenario/store.ts';
import { buildNetwork } from './simulation/transport/network.ts';
import { computeStats } from './simulation/statistics.ts';
import SimControls, { type Speed } from './ui/controls/SimControls.tsx';
import LayerToggles from './ui/controls/LayerToggles.tsx';
import OverlaySwitch, { type TravelDest } from './ui/controls/OverlaySwitch.tsx';
import StatsPanel from './ui/dashboard/StatsPanel.tsx';
import DebugPanel from './ui/dashboard/DebugPanel.tsx';
import Inspector from './ui/inspectors/Inspector.tsx';
import AnalyticsPanel from './ui/analytics/AnalyticsPanel.tsx';
import ChartsPanel from './ui/analytics/ChartsPanel.tsx';
import { buildUtilization } from './simulation/analytics/utilization.ts';
import BuildPanel, { type BuildTool } from './ui/build/BuildPanel.tsx';
import ComparePanel, { type CompareResult } from './ui/build/ComparePanel.tsx';
import ScenarioPanel from './ui/build/ScenarioPanel.tsx';

const SEED = 1337;
const TICKS_PER_SEC: Record<Speed, number> = { 1: 2, 5: 8, 20: 24 };
const ROAD_SNAP_M = 45;

type Mode = 'simulate' | 'build';

interface PendingDelete {
  kind: 'station' | 'route' | 'road';
  id: string;
  label: string;
  usage: string;
}

export default function App() {
  const baseCity = useMemo(() => generateCity(SEED), []);
  const baseNet = useMemo(() => buildNetwork(), []);

  // Live sim lives in a ref (advanced by the loop); panels render from a
  // throttled snapshot so React never re-renders at sim-step rate.
  const [snapshot, setSnapshot] = useState<SimulationState>(() => createSimulation(SEED));
  const simRef = useRef<SimulationState>(snapshot);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>(1);
  const [layers, setLayers] = useState<Layers>({ metro: true, rail: true, bus: true, roads: true, buildings: true });
  const [overlay, setOverlay] = useState<Overlay>('normal');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [travelDest, setTravelDest] = useState<TravelDest>('cbd');
  const [coverageThreshold, setCoverageThreshold] = useState(500);
  const [history, setHistory] = useState<SeriesPoint[]>([]);
  const lastHistTick = useRef(0);

  // Scenario + build state. Base city/seed never mutate; ops replay into mod.
  const [mode, setMode] = useState<Mode>('simulate');
  const [tool, setTool] = useState<BuildTool>('metro');
  const [ops, setOps] = useState<EditOp[]>([]);
  const [redo, setRedo] = useState<EditOp[]>([]);
  const [viewing, setViewing] = useState<'base' | 'scenario'>('scenario');
  const [networkKey, setNetworkKey] = useState(0);
  const mod = useMemo(() => applyEdits(baseCity, baseNet, ops), [baseCity, baseNet, ops]);

  // Draft state per tool.
  const [draftStations, setDraftStations] = useState<string[]>([]);
  const [draftName, setDraftName] = useState('');
  const [draftPoint, setDraftPoint] = useState<{ x: number; z: number } | null>(null);
  const [draftNodes, setDraftNodes] = useState<{ x: number; z: number; snappedId: string | null }[]>([]);
  const [roadKind, setRoadKind] = useState<RoadKind>('arterial');
  const [extendRouteId, setExtendRouteId] = useState<string | null>(null);
  const [extendStations, setExtendStations] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [hover, setHover] = useState<{ x: number; z: number } | null>(null);

  // Compare + saved scenarios.
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [compareRunning, setCompareRunning] = useState(false);
  const [compareProgress, setCompareProgress] = useState('');
  const [scenarioMeta, setScenarioMeta] = useState<Scenario>(() => createScenario('East-West Metro', SEED));
  const [saved, setSaved] = useState<Scenario[]>(() => listScenarios());

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
          const sim = simRef.current;
          setSnapshot(sim);
          if (sim.tick - lastHistTick.current >= 5) {
            lastHistTick.current = sim.tick;
            const point = samplePoint(sim);
            setHistory((h) => (h.length >= 288 ? [...h.slice(-287), point] : [...h, point]));
          }
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  const stats = computeStats(snapshot);

  // Analytics layer: pure functions over sim state (structural ones recompute
  // with the network; live ones refresh with each snapshot).
  const access = useMemo(
    () => computeAccessibility({ zones: snapshot.city.zones, stations: snapshot.stations, connections: snapshot.connections, routes: snapshot.routes }),
    [snapshot],
  );
  const coverage = useMemo(
    () => computeCoverage(snapshot.city.zones, snapshot.stations, coverageThreshold),
    [snapshot, coverageThreshold],
  );
  const bottlenecks = useMemo(
    () => findBottlenecks({
      stations: snapshot.stations,
      routes: snapshot.routes,
      counters: snapshot.counters,
      edgeState: snapshot.edgeState,
      roadGraph: snapshot.roadGraph,
      busRouteCongestion: snapshot.busRouteCongestion,
    }),
    [snapshot],
  );
  const gaps = useMemo(
    () => findTransitGaps({ zones: snapshot.city.zones, stations: snapshot.stations, connections: snapshot.connections, routes: snapshot.routes }),
    [snapshot],
  );
  const score = useMemo(() => planningScore(stats, access, coverage), [stats, access, coverage]);
  const utilization = useMemo(() => buildUtilization(snapshot), [snapshot]);
  const topStations = useMemo(
    () => [...snapshot.stations].sort((a, b) => b.boardedDay - a.boardedDay).slice(0, 6).map((s) => ({ name: s.name, boarded: Math.round(s.boardedDay) })),
    [snapshot],
  );
  const analyticsView: AnalyticsView | null = useMemo(() => {
    if (overlay !== 'accessibility' && overlay !== 'traveltime' && overlay !== 'coverage' && overlay !== 'bottlenecks') return null;
    const grades: Record<string, 'excellent' | 'good' | 'moderate' | 'poor' | 'very poor'> = {};
    const travel: Record<string, number | null> = {};
    const cov: Record<string, number> = {};
    let travelMax = 1;
    for (const z of access.zones) {
      grades[z.zoneId] = z.grade;
      const t = travelDest === 'cbd' ? z.toCBD : travelDest === 'airport' ? z.toAirport : travelDest === 'university' ? z.toUniv : travelDest === 'industrial' ? z.toIndustrial : z.toHarbor;
      travel[z.zoneId] = t;
      if (t !== null && t > travelMax) travelMax = t;
    }
    for (const z of coverage.perZone) cov[z.zoneId] = z.pct;
    return {
      grades,
      travel,
      travelMax,
      coverage: cov,
      bottleneckStations: bottlenecks.stations.slice(0, 5).map((b) => b.id),
    };
  }, [overlay, access, coverage, bottlenecks, travelDest]);

  // ---- scenario application ----
  function resetSimTo(city: typeof baseCity, net: typeof baseNet) {
    simRef.current = createSimulationFromParts(SEED, city, net);
    setSnapshot(simRef.current);
    setSelection(null);
    setHistory([]);
    lastHistTick.current = 0;
  }

  function applyOps(nextOps: EditOp[], nextRedo: EditOp[], view: 'base' | 'scenario' = viewing) {
    setOps(nextOps);
    setRedo(nextRedo);
    setCompareResult(null);
    clearDraft();
    if (view === 'scenario') {
      const applied = applyEdits(baseCity, baseNet, nextOps);
      resetSimTo(applied.city, applied);
      setNetworkKey((k) => k + 1);
    }
  }

  function clearDraft() {
    setDraftStations([]);
    setDraftName('');
    setDraftPoint(null);
    setDraftNodes([]);
    setExtendRouteId(null);
    setExtendStations([]);
    setPendingDelete(null);
    setHover(null);
  }

  function enterBuild() {
    setMode('build');
    setPlaying(false);
    setViewing('scenario');
    resetSimTo(mod.city, mod);
    setNetworkKey((k) => k + 1);
    clearDraft();
  }

  function enterSimulate() {
    setMode('simulate');
    clearDraft();
  }

  function onView(v: 'base' | 'scenario') {
    setViewing(v);
    clearDraft();
    if (v === 'base') resetSimTo(baseCity, baseNet);
    else resetSimTo(mod.city, mod);
    setNetworkKey((k) => k + 1);
  }

  // ---- build interactions (from the 3D view) ----
  const stationPos = useMemo(() => new Map(snapshot.stations.map((s) => [s.id, { x: s.pos.x, z: s.pos.z }])), [snapshot]);

  function handleBuildPick(sel: Selection) {
    if (tool === 'metro' || tool === 'bus') {
      if (sel.kind !== 'station') return;
      setDraftStations((prev) => (prev[prev.length - 1] === sel.id ? prev : [...prev, sel.id]));
    } else if (tool === 'extend') {
      if (!extendRouteId) {
        if (sel.kind !== 'route') return;
        setExtendRouteId(sel.id);
      } else if (sel.kind === 'station') {
        setExtendStations((prev) => (prev[prev.length - 1] === sel.id ? prev : [...prev, sel.id]));
      }
    } else if (tool === 'delete') {
      if (sel.kind === 'station') {
        const st = snapshot.stations.find((s) => s.id === sel.id);
        if (!st) return;
        setPendingDelete({
          kind: 'station', id: st.id, label: st.name,
          usage: st.boardedDay > 0 ? `${Math.round(st.boardedDay)} boarded` : 'unused',
        });
      } else if (sel.kind === 'route') {
        const r = snapshot.routes.find((x) => x.id === sel.id);
        if (!r) return;
        const used = snapshot.counters.routeBoardings[r.id] ?? 0;
        setPendingDelete({
          kind: 'route', id: r.id, label: r.name,
          usage: used > 0 ? `${Math.round(used)} boardings` : 'unused',
        });
      } else if (sel.kind === 'road') {
        const st = snapshot.edgeState[sel.id];
        const edge = snapshot.city.roadEdges.find((e) => e.id === sel.id);
        const label = edge ? `${edge.a.replace(/^rn-/, '').toUpperCase()}–${edge.b.replace(/^rn-/, '').toUpperCase()}` : sel.id;
        setPendingDelete({
          kind: 'road', id: sel.id, label: `Road ${label}`,
          usage: st && st.load > 0 ? `${st.load} cars, v/c ${st.vc.toFixed(2)}` : 'no traffic',
        });
      }
    }
  }

  function handleMapClick(x: number, z: number) {
    if (tool === 'station') {
      if (validateStationPlacement(x, z)) return;
      setDraftPoint({ x: Math.round(x), z: Math.round(z) });
    } else if (tool === 'road') {
      if (validateRoadNode(x, z)) return;
      const snapped = mod.city.roadNodes.find((n) => Math.hypot(n.pos.x - x, n.pos.z - z) < ROAD_SNAP_M);
      setDraftNodes((prev) => [...prev, snapped ? { x: snapped.pos.x, z: snapped.pos.z, snappedId: snapped.id } : { x: Math.round(x), z: Math.round(z), snappedId: null }]);
    }
  }

  function handleHover(x: number, z: number) {
    if (tool === 'station' || tool === 'road') setHover({ x, z });
  }

  // ---- draft confirm ----
  function defaultRouteName(m: 'metro' | 'bus'): string {
    const n = mod.routes.filter((r) => r.mode === m).length + 1;
    return m === 'metro' ? `M${n} Metro` : `B${n} Bus`;
  }

  function draftCost(): string {
    if (tool === 'metro' || tool === 'bus' || tool === 'extend') {
      const ids = tool === 'extend' ? extendStations : draftStations;
      if (ids.length < (tool === 'extend' ? 1 : 2)) return '—';
      if (tool === 'bus' || (tool === 'extend' && snapshot.routes.find((r) => r.id === extendRouteId)?.mode === 'bus')) {
        return formatCost(120_000_000 + ids.length * 5_000_000);
      }
      let len = 0;
      const seq = tool === 'extend'
        ? [extendRouteId ? snapshot.routes.find((r) => r.id === extendRouteId)?.stationIds.slice(-1)[0] ?? '' : '', ...ids]
        : ids;
      for (let i = 0; i < seq.length - 1; i++) {
        const a = stationPos.get(seq[i]);
        const b = stationPos.get(seq[i + 1]);
        if (a && b) len += Math.hypot(a.x - b.x, a.z - b.z);
      }
      return formatCost(len * 900_000);
    }
    if (tool === 'station') return draftPoint ? formatCost(4_500_000_000) : '—';
    if (tool === 'road') {
      if (draftNodes.length < 2) return '—';
      let len = 0;
      for (let i = 0; i < draftNodes.length - 1; i++) {
        len += Math.hypot(draftNodes[i + 1].x - draftNodes[i].x, draftNodes[i + 1].z - draftNodes[i].z);
      }
      const rate = roadKind === 'local' ? 150_000 : roadKind === 'arterial' ? 400_000 : 900_000;
      return formatCost(len * rate);
    }
    return '—';
  }

  function onConfirm() {
    if (tool === 'metro' || tool === 'bus') {
      if (draftStations.length < 2) return;
      const m = tool;
      const id = nextRouteId(ops, m);
      const op: EditOp = {
        type: 'addRoute',
        route: {
          id,
          name: draftName.trim() || defaultRouteName(m),
          mode: m,
          color: paletteColor(mod.routes.length),
          stationIds: [...draftStations],
          headwayMin: m === 'metro' ? 6 : 12,
          speedKph: m === 'metro' ? 32 : 18,
          vehicleCapacity: m === 'metro' ? 800 : 70,
        },
      };
      const r = pushOp(ops, redo, op);
      applyOps(r.ops, r.redo);
    } else if (tool === 'station') {
      if (!draftPoint) return;
      const id = nextStationId(ops);
      const count = ops.filter((o) => o.type === 'addStation').length + 1;
      const op: EditOp = {
        type: 'addStation',
        station: { id, name: draftName.trim() || `New Station ${count}`, x: draftPoint.x, z: draftPoint.z, capacityPerHr: 4000 },
      };
      const r = pushOp(ops, redo, op);
      applyOps(r.ops, r.redo);
    } else if (tool === 'road') {
      if (draftNodes.length < 2) return;
      const k = ops.filter((o) => o.type === 'addRoad').length + 1;
      const nodes = draftNodes.map((n, i) => ({
        id: n.snappedId ?? `rn-u${k}-${i + 1}`,
        x: n.x,
        z: n.z,
      }));
      const edges = nodes.slice(0, -1).map((n, i) => ({ id: `re-u${k}-${i + 1}`, a: n.id, b: nodes[i + 1].id, kind: roadKind }));
      const op: EditOp = { type: 'addRoad', nodes, edges };
      const r = pushOp(ops, redo, op);
      applyOps(r.ops, r.redo);
    } else if (tool === 'extend') {
      if (!extendRouteId || extendStations.length < 1) return;
      const op: EditOp = { type: 'extendRoute', routeId: extendRouteId, stationIds: [...extendStations] };
      const r = pushOp(ops, redo, op);
      applyOps(r.ops, r.redo);
    } else if (tool === 'delete') {
      if (!pendingDelete) return;
      const op: EditOp =
        pendingDelete.kind === 'station'
          ? { type: 'removeStation', stationId: pendingDelete.id }
          : pendingDelete.kind === 'route'
            ? { type: 'removeRoute', routeId: pendingDelete.id }
            : { type: 'removeRoad', edgeId: pendingDelete.id };
      const r = pushOp(ops, redo, op);
      applyOps(r.ops, r.redo);
    }
  }

  // ---- compare ----
  async function onRunCompare() {
    if (ops.length === 0 || compareRunning) return;
    setCompareRunning(true);
    setCompareProgress('base…');
    await new Promise((r) => setTimeout(r, 30));
    const cmp = compareScenarios(SEED, baseCity, baseNet, mod.city, mod, mod.cost, coverageThreshold);
    setCompareProgress('scenario…');
    await new Promise((r) => setTimeout(r, 30));
    setCompareResult({ rows: cmp.rows, base: cmp.base, mod: cmp.mod, baseScore: cmp.baseScore, modScore: cmp.modScore, impact: cmp.impact });
    setCompareRunning(false);
    setCompareProgress('');
  }

  // ---- build props for the 3D view ----
  const diff = useMemo(() => {
    const baseRouteIds = new Set(baseNet.routes.map((r) => r.id));
    const modRouteIds = new Set(mod.routes.map((r) => r.id));
    const baseStationIds = new Set(baseNet.stations.map((s) => s.id));
    const baseStationPos = new Map(baseNet.stations.map((s) => [s.id, s.pos]));
    return {
      addedRoutes: mod.routes.map((r) => r.id).filter((id) => !baseRouteIds.has(id)),
      addedStations: mod.stations.map((s) => s.id).filter((id) => !baseStationIds.has(id)),
      removedStations: baseNet.stations
        .filter((s) => !mod.stations.some((m) => m.id === s.id))
        .map((s) => ({ x: s.pos.x, z: s.pos.z })),
      removedRoutes: [...baseRouteIds].filter((id) => !modRouteIds.has(id)),
      baseStationPos,
    };
  }, [baseNet, mod]);

  const draftView: DraftView | null =
    mode !== 'build'
      ? null
      : tool === 'metro' || tool === 'bus'
        ? {
            points: draftStations.map((id) => stationPos.get(id)).filter((p): p is { x: number; z: number } => Boolean(p)).map((p) => ({ x: p.x, z: p.z })),
            hover: null,
            hoverValid: true,
          }
        : tool === 'extend'
          ? {
              points: extendStations.map((id) => stationPos.get(id)).filter((p): p is { x: number; z: number } => Boolean(p)).map((p) => ({ x: p.x, z: p.z })),
              hover: null,
              hoverValid: true,
            }
          : tool === 'station'
            ? {
                points: draftPoint ? [draftPoint] : [],
                hover,
                hoverValid: hover ? !validateStationPlacement(hover.x, hover.z) : true,
              }
            : tool === 'road'
              ? {
                  points: draftNodes.map((n) => ({ x: n.x, z: n.z })),
                  hover,
                  hoverValid: hover ? !validateRoadNode(hover.x, hover.z) : true,
                }
              : null;

  const buildIx =
    mode === 'build'
      ? {
          pickKinds: (
            tool === 'metro' || tool === 'bus'
              ? ['station']
              : tool === 'extend'
                ? extendRouteId
                  ? ['station']
                  : ['route']
                : tool === 'delete'
                  ? ['station', 'route', 'road']
                  : []
          ) as Selection['kind'][],
          onPick: handleBuildPick,
          onMapClick: handleMapClick,
          onHover: handleHover,
        }
      : null;

  const draftHint =
    tool === 'metro'
      ? `Metro: click stations in order (${draftStations.length} selected, min 2). New stations count too.`
      : tool === 'station'
        ? 'Station: click the map to place it. Green = valid, red = invalid.'
        : tool === 'bus'
          ? `Bus: click stations in order (${draftStations.length} selected, min 2).`
          : tool === 'road'
            ? `Road (${roadKind}): click map points (${draftNodes.length} nodes, min 2). Snaps near existing nodes.`
            : tool === 'extend'
              ? !extendRouteId
                ? 'Extend: click a route first.'
                : `Extend ${snapshot.routes.find((r) => r.id === extendRouteId)?.name ?? ''}: click stations to append.`
              : pendingDelete
                ? `Delete ${pendingDelete.label}? Confirm below.`
                : 'Delete: click a route, station, or road. Used infrastructure asks for confirmation.';

  return (
    <div className="tf-root">
      <header className="tf-topbar">
        <div className="tf-brand">TransitForge</div>
        <div className="tf-speeds" role="group" aria-label="Editor mode">
          <button type="button" className={`tf-btn small${mode === 'simulate' ? ' active' : ''}`} onClick={enterSimulate}>
            Simulate
          </button>
          <button type="button" className={`tf-btn small${mode === 'build' ? ' active' : ''}`} onClick={enterBuild}>
            Build
          </button>
        </div>
        <SimControls
          playing={playing}
          speed={speed}
          tick={snapshot.tick}
          timeMinutes={snapshot.timeMinutes}
          onToggle={() => {
            if (mode === 'build') {
              enterSimulate();
              setPlaying(true);
            } else setPlaying((p) => !p);
          }}
          onSpeed={(s) => setSpeed(s)}
          onReset={() => {
            if (viewing === 'base') resetSimTo(baseCity, baseNet);
            else resetSimTo(mod.city, mod);
          }}
          onStep={() => { simRef.current = stepSimulation(simRef.current, 1); setSnapshot(simRef.current); }}
        />
      </header>
      <main className="tf-main">
        <section className="tf-viewport">
          <SceneView
            simRef={simRef}
            layers={layers}
            overlay={overlay}
            selection={selection}
            onSelect={mode === 'simulate' ? setSelection : () => {}}
            networkKey={networkKey}
            ghosts={viewing === 'scenario' ? diff.removedStations : []}
            highlightRoutes={viewing === 'scenario' ? diff.addedRoutes : []}
            build={buildIx}
            draft={draftView}
            analytics={analyticsView}
          />
          <div className="tf-overlay-hint">
            {mode === 'build'
              ? 'build mode · sim paused · edits reset the day'
              : 'drag orbit · right-drag pan · wheel zoom · click station/route/road/district'}
          </div>
        </section>
        <aside className="tf-panel">
          {mode === 'simulate' ? (
            <>
              <LayerToggles layers={layers} onChange={setLayers} />
              <OverlaySwitch
                overlay={overlay}
                onChange={setOverlay}
                travelDest={travelDest}
                onTravelDest={setTravelDest}
                coverageThreshold={coverageThreshold}
                onCoverageThreshold={setCoverageThreshold}
              />
              <StatsPanel stats={stats} />
              <AnalyticsPanel
                access={access}
                coverage={coverage}
                score={score}
                bottlenecks={bottlenecks}
                gaps={gaps}
                utilization={utilization}
                onSelect={setSelection}
              />
              <ChartsPanel history={history} topStations={topStations} />
              <Inspector selection={selection} sim={snapshot} onClose={() => setSelection(null)} />
              <DebugPanel sim={snapshot} />
            </>
          ) : (
            <>
              <BuildPanel
                tool={tool}
                onTool={(t) => { setTool(t); clearDraft(); }}
                draft={{
                  stationCount: tool === 'extend' ? extendStations.length : draftStations.length,
                  nodeCount: draftNodes.length,
                  name: draftName,
                  costPreview: draftCost(),
                  canConfirm:
                    (tool === 'metro' || tool === 'bus' ? draftStations.length >= 2 : false) ||
                    (tool === 'station' && draftPoint !== null) ||
                    (tool === 'road' && draftNodes.length >= 2) ||
                    (tool === 'extend' && extendRouteId !== null && extendStations.length >= 1) ||
                    (tool === 'delete' && pendingDelete !== null),
                  confirmLabel: tool === 'delete' ? 'Confirm delete' : tool === 'extend' ? 'Append' : 'Build',
                  hint: draftHint,
                  pendingDeleteLabel: pendingDelete?.label ?? null,
                  pendingDeleteUsage: pendingDelete?.usage ?? null,
                  extendRouteName: extendRouteId ? snapshot.routes.find((r) => r.id === extendRouteId)?.name ?? null : null,
                }}
                onName={setDraftName}
                onConfirm={onConfirm}
                onCancel={clearDraft}
                roadKind={roadKind}
                onRoadKind={setRoadKind}
                canUndo={ops.length > 0}
                canRedo={redo.length > 0}
                onUndo={() => {
                  const r = undoOp(ops, redo);
                  applyOps(r.ops, r.redo);
                }}
                onRedo={() => {
                  const r = redoOp(ops, redo);
                  applyOps(r.ops, r.redo);
                }}
                opCount={ops.length}
                scenarioCost={formatCost(mod.cost)}
              />
              <ScenarioPanel
                name={scenarioMeta.name}
                onName={(n) => setScenarioMeta((s) => ({ ...s, name: n }))}
                onSave={() => {
                  saveScenario({ ...scenarioMeta, seed: SEED, ops, version: 1 });
                  setSaved(listScenarios());
                }}
                saved={saved}
                onLoad={(s) => {
                  setScenarioMeta(s);
                  setViewing('scenario');
                  applyOps(s.ops, [], 'scenario');
                }}
                onRename={(s, name) => {
                  saveScenario({ ...s, name });
                  setSaved(listScenarios());
                }}
                onDuplicate={(s) => {
                  duplicateScenario(s);
                  setSaved(listScenarios());
                }}
                onDelete={(id) => {
                  deleteScenario(id);
                  setSaved(listScenarios());
                }}
              />
              <ComparePanel
                result={compareResult}
                running={compareRunning}
                progress={compareProgress}
                onRun={onRunCompare}
                viewing={viewing}
                onView={onView}
                hasEdits={ops.length > 0}
              />
            </>
          )}
        </aside>
      </main>
    </div>
  );
}
