import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import SceneView, { type AnalyticsView, type DraftView, type Layers, type Overlay, type Selection } from './rendering/SceneView.tsx';
import { generateCity } from './simulation/city/generateCity.ts';
import { createSimulation, createSimulationFromParts, formatClock, stepSimulation, type SimulationState } from './simulation/index.ts';
import { computeAccessibility } from './simulation/analytics/accessibility.ts';
import { computeCoverage } from './simulation/analytics/coverage.ts';
import { findBottlenecks } from './simulation/analytics/bottlenecks.ts';
import { findTransitGaps } from './simulation/analytics/gaps.ts';
import { planningScore, populationImpact } from './simulation/analytics/impact.ts';
import { samplePoint, type SeriesPoint } from './simulation/analytics/series.ts';
import { applyEdits, validateIncidentConfig } from './simulation/scenario/applyEdits.ts';
import { compareHorizons, compareResilience, compareScenarios } from './simulation/scenario/compare.ts';
import { evaluatePlan, type PlanEvaluation } from './simulation/scenario/evaluate.ts';
import {
  evaluateConstraints,
  evaluateObjective,
  readMetric,
  type MetricsBundle,
} from './simulation/planning/objectives.ts';
import { generateBriefs, type Difficulty, type PlanningBrief } from './simulation/planning/briefs.ts';
import { detectProblems, type CityProblem } from './simulation/planning/problems.ts';
import type { RecContext } from './simulation/planning/recommendations.ts';
import { buildReport, reportToHtml, reportToJson, type PlanReport } from './simulation/planning/report.ts';
import type { PlanningScore } from './simulation/analytics/impact.ts';
import {
  deletePlan,
  listPlans,
  makePlanId,
  savePlan,
  type SavedPlan,
} from './simulation/planning/planStore.ts';
import { constraintInputs } from './simulation/scenario/evaluate.ts';
import {
  deployReplacement,
  incidentPresets,
  type IncidentConfig,
} from './simulation/incidents/incidents.ts';
import { criticalityAnalysis, type CriticalItem } from './simulation/analytics/resilience.ts';
import type { CompareRow } from './simulation/scenario/compare.ts';
import {
  BASE_YEAR,
  forecastGrowth,
  growZones,
  planAdvice,
  SIM_TRIPS_SCALE,
  computeDemandLayers,
  type GrowthPoint,
} from './simulation/growth/growth.ts';
import {
  createScenario,
  formatCost,
  mergeServicePatch,
  nextRouteId,
  nextStationId,
  paletteColor,
  pushOp,
  redoOp,
  sanitizeServicePatch,
  undoOp,
  validateRoadNode,
  validateStationPlacement,
  type EditOp,
  type RoadKind,
  type Scenario,
  type ServicePatch,
} from './simulation/scenario/scenario.ts';
import { sanitizeFares, type FarePolicy } from './simulation/economics/fares.ts';
import { deleteScenario, duplicateScenario, listScenarios, saveScenario } from './simulation/scenario/store.ts';
import { buildNetwork } from './simulation/transport/network.ts';
import { computeStats } from './simulation/statistics.ts';
import SimControls, { type Speed } from './ui/controls/SimControls.tsx';
import LayerToggles from './ui/controls/LayerToggles.tsx';
import OverlaySwitch, { type DemandLayer, type TravelDest } from './ui/controls/OverlaySwitch.tsx';
import StatsPanel from './ui/dashboard/StatsPanel.tsx';
import DebugPanel from './ui/dashboard/DebugPanel.tsx';
import Inspector from './ui/inspectors/Inspector.tsx';
import AnalyticsPanel from './ui/analytics/AnalyticsPanel.tsx';
import ChartsPanel from './ui/analytics/ChartsPanel.tsx';
import { buildUtilization } from './simulation/analytics/utilization.ts';
import PlanningPanel from './ui/planning/PlanningPanel.tsx';
import BuildPanel, { type BuildTool } from './ui/build/BuildPanel.tsx';
import ComparePanel, { type CompareResult } from './ui/build/ComparePanel.tsx';
import DisruptPanel from './ui/disrupt/DisruptPanel.tsx';
import { EMPTY_DRAFT, type IncidentDraft } from './ui/disrupt/draft.ts';
import GrowthPanel, { type ForecastView } from './ui/growth/GrowthPanel.tsx';
import type { Zone } from './types/index.ts';
import ScenarioPanel from './ui/build/ScenarioPanel.tsx';
import ServicePanel from './ui/service/ServicePanel.tsx';
import ModeSwitch, { type AppMode as Mode } from './ui/shell/ModeSwitch.tsx';
import StatusBar from './ui/shell/StatusBar.tsx';
import Legend from './ui/shell/Legend.tsx';
import Toasts, { type Toast } from './ui/shell/Toasts.tsx';
import { IconClose, IconPlan } from './ui/shell/icons.tsx';
import { cycleMin, fleetRequired, phaseOffset } from './simulation/service/timetable.ts';
import { headwayAt } from './simulation/service/servicePlan.ts';
import { LOOP_ROUTES } from './simulation/passengers/passengers.ts';

const SEED = 1337;
const TICKS_PER_SEC: Record<Speed, number> = { 1: 2, 5: 8, 20: 24 };
const ROAD_SNAP_M = 45;
const TOAST_TTL_MS = 7000;
const MAX_TOASTS = 4;

const MODE_LABEL: Record<Mode, string> = {
  simulate: 'Simulate',
  build: 'Build',
  disrupt: 'Disrupt',
  plan: 'Plan',
};

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
  const [serviceRouteId, setServiceRouteId] = useState<string | null>(null);
  const fleetNonce = useRef(0);

  // Scenario + build state. Base city/seed never mutate; ops replay into mod.
  const [mode, setMode] = useState<Mode>('simulate');
  const [tool, setTool] = useState<BuildTool>('metro');
  const [ops, setOps] = useState<EditOp[]>([]);
  const [redo, setRedo] = useState<EditOp[]>([]);
  const [viewing, setViewing] = useState<'base' | 'scenario'>('scenario');
  const [networkKey, setNetworkKey] = useState(0);
  // Growth state: grown zones override the seed city (null = pristine).
  const [zoneState, setZoneState] = useState<Zone[] | null>(null);
  const [yearsApplied, setYearsApplied] = useState(0);
  const [growthHistory, setGrowthHistory] = useState<GrowthPoint[]>([]);
  const [forecast, setForecast] = useState<ForecastView | null>(null);
  const [growing, setGrowing] = useState(false);
  const [demandLayer, setDemandLayer] = useState<DemandLayer>('origins');
  const [compareHorizon, setCompareHorizon] = useState(0);
  const effBaseCity = useMemo(() => (zoneState ? { ...baseCity, zones: zoneState } : baseCity), [baseCity, zoneState]);
  const mod = useMemo(() => applyEdits(effBaseCity, baseNet, ops), [effBaseCity, baseNet, ops]);

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
  const [critical, setCritical] = useState<CriticalItem[] | null>(null);

  // Planning state.
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [briefId, setBriefId] = useState<string | null>(null);
  const [baselineBundle, setBaselineBundle] = useState<MetricsBundle | null>(null);
  const [planHorizon, setPlanHorizon] = useState(5);
  const [evaluation, setEvaluation] = useState<{
    report: PlanReport;
    rows: CompareRow[];
    resilienceRows: CompareRow[] | null;
    score: PlanningScore;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [plans, setPlans] = useState<SavedPlan[]>(() => listPlans());
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [tutorialDismissed, setTutorialDismissed] = useState(() => {
    try {
      return localStorage.getItem('transitforge.tutorial.v1') === 'done';
    } catch {
      return false;
    }
  });
  const tutorialSeen = useRef<Set<string>>(new Set());
  const evalCache = useRef(new Map<string, PlanEvaluation>());

  // Shell state: event toasts + side-panel visibility.
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenEvents = useRef<Set<string>>(new Set());
  const toastSeq = useRef(1);
  const [railOpen, setRailOpen] = useState(true);

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

  // Tutorial progress follows real user actions (persists via dismissal flag).
  // Marked inside the memo so progress never flickers backwards.
  const tutorialSteps = useMemo(() => {
    const seen = tutorialSeen.current;
    if (playing) seen.add('play');
    if (selection) seen.add('select');
    if (selection?.kind === 'station') seen.add('station');
    if (overlay === 'crowding') seen.add('crowding');
    if (overlay === 'accessibility' || overlay === 'traveltime' || overlay === 'coverage') seen.add('analytics');
    if (mode === 'build') seen.add('build');
    if (ops.some((o) => o.type === 'setService')) seen.add('service');
    if (snapshot.tick > 100) seen.add('run');
    if (compareResult) seen.add('compare');
    const has = (k: string) => seen.has(k);
    return [
      { label: 'Inspect the city (click a district)', done: has('select') },
      { label: 'Start the simulation (Space)', done: has('play') },
      { label: 'Select a station', done: has('station') },
      { label: 'Inspect crowding overlay', done: has('crowding') },
      { label: 'Open an analytics overlay', done: has('analytics') },
      { label: 'Enter Build mode (B)', done: has('build') },
      { label: 'Modify a service frequency', done: has('service') },
      { label: 'Run the simulation past tick 100', done: has('run') },
      { label: 'Compare baseline vs scenario', done: has('compare') },
    ];
  }, [playing, selection, overlay, mode, ops, snapshot, compareResult]);

  // Keyboard shortcuts (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === ' ') {
        e.preventDefault();
        if (mode !== 'simulate') {
          enterSimulate();
          setPlaying(true);
        } else setPlaying((p) => !p);
      } else if (e.key === '1') setSpeed(1);
      else if (e.key === '2') setSpeed(5);
      else if (e.key === '3') setSpeed(20);
      else if (e.key === 'b' || e.key === 'B') {
        if (mode === 'build') enterSimulate();
        else enterBuild();
      } else if (e.key === 'd' || e.key === 'D') {
        if (mode === 'disrupt') enterSimulate();
        else enterDisrupt();
      } else if (e.key === 'a' || e.key === 'A') {
        setOverlay((o) => (o === 'normal' ? 'accessibility' : 'normal'));
      } else if (e.key === 'p' || e.key === 'P') {
        if (mode === 'plan') enterSimulate();
        else enterPlan();
      } else if (e.key === '[') {
        setRailOpen((r) => !r);
      } else if (e.key === ']') {
        if (!railOpen) setRailOpen(true);
      } else if (e.key === 'Escape') {
        enterSimulate();
      } else if (e.key === 'r' || e.key === 'R') {
        resetAll();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // New simulation events surface as transient HUD toasts (deduped by key).
  useEffect(() => {
    const seen = seenEvents.current;
    const fresh = snapshot.events.filter((e) => !seen.has(`${e.t}|${e.text}`));
    if (fresh.length === 0) return;
    if (seen.size > 400) seen.clear();
    for (const e of fresh) seen.add(`${e.t}|${e.text}`);
    const batch = fresh.slice(-2).map((e) => ({
      id: toastSeq.current++,
      level: e.level,
      text: e.text,
      time: formatClock(e.t),
    }));
    setToasts((t) => [...batch, ...t].slice(0, MAX_TOASTS));
    const ids = batch.map((b) => b.id);
    const timer = window.setTimeout(() => {
      setToasts((t) => t.filter((x) => !ids.includes(x.id)));
    }, TOAST_TTL_MS);
    return () => window.clearTimeout(timer);
  }, [snapshot]);

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
  // Planning facts: worst offenders and zone rankings distilled from live state.
  const briefFacts = useMemo(() => {
    const worstRouteRow = [...utilization.routes].sort((a, b) => b.peakOcc - a.peakOcc)[0] ?? null;
    const worstRoadRow = [...utilization.roads].sort((a, b) => b.vc - a.vc)[0] ?? null;
    const worstBridgeRow = utilization.roads.filter((r) => {
      const e = snapshot.roadGraph.edgeById.get(r.id);
      return e?.isBridge === true;
    }).sort((a, b) => b.vc - a.vc)[0] ?? null;
    const airport = snapshot.city.zones.find((z) => z.kind === 'airport') ?? null;
    const central = [...snapshot.stations].sort((a, b) => b.routeIds.length - a.routeIds.length)[0] ?? null;
    return {
      transitShare: stats.transitShare,
      avgCongestion: stats.avgCongestion,
      avgTravelMin: stats.avgTravelMin,
      maxOccupancy: stats.maxOccupancy,
      accessScore: access.cityScore,
      coveragePct: coverage.pct,
      opCost: stats.opCost,
      population: stats.population,
      worstRoute: worstRouteRow ? { id: worstRouteRow.id, name: worstRouteRow.name, occ: worstRouteRow.peakOcc } : null,
      worstEdge: worstRoadRow ? { id: worstRoadRow.id, label: worstRoadRow.label, vc: worstRoadRow.vc * 100 } : null,
      worstBridge: worstBridgeRow ? { id: worstBridgeRow.id, label: worstBridgeRow.label, vc: worstBridgeRow.vc * 100 } : null,
      lowAccessZones: [...access.zones].sort((a, b) => a.score - b.score).slice(0, 3).map((z) => {
        const zn = snapshot.city.zones.find((x) => x.id === z.zoneId);
        return { id: z.zoneId, name: z.zoneName, score: z.score, population: zn?.population ?? 0 };
      }),
      growthZones: [...snapshot.city.zones].sort((a, b) => b.popGrowthRate - a.popGrowthRate).slice(0, 3).map((z) => ({
        id: z.id, name: z.name, popGrowthRate: z.popGrowthRate, population: z.population,
      })),
      airportZone: airport ? { id: airport.id, name: airport.name, jobs: airport.jobs } : null,
      centralStationId: central ? central.id : null,
      busiestRouteId: worstRouteRow ? worstRouteRow.id : null,
    };
  }, [snapshot, stats, access, coverage, utilization]);
  const briefs = useMemo(() => generateBriefs(briefFacts, difficulty, stats.opCost), [briefFacts, difficulty, stats.opCost]);
  const activeBrief: PlanningBrief | null = useMemo(
    () => briefs.find((b) => b.id === briefId) ?? null,
    [briefs, briefId],
  );
  const liveBundle: MetricsBundle = useMemo(() => ({
    stats,
    access,
    coverage,
    routePeakOcc: snapshot.counters.routePeakOcc,
    edgeVC: Object.fromEntries(Object.entries(snapshot.edgeState).map(([id, st]) => [id, st.vc])),
    resilienceScore: null,
    constructionCost: mod.cost,
  }), [stats, access, coverage, snapshot, mod]);
  const liveObjectiveResults = useMemo(
    () => (activeBrief ? activeBrief.objectives.map((o) => evaluateObjective(o, liveBundle, readMetric(baselineBundle ?? liveBundle, o.metric, o.targetId))) : []),
    [activeBrief, liveBundle, baselineBundle],
  );
  const liveConstraintResults = useMemo(
    () => (activeBrief ? evaluateConstraints(activeBrief.constraints, constraintInputs(ops, mod, stats.opCost, stats.subsidy)) : []),
    [activeBrief, ops, mod, stats],
  );
  const problems = useMemo(
    () => detectProblems({
      bottlenecks,
      gaps,
      zones: snapshot.city.zones.map((z) => ({ id: z.id, name: z.name, population: z.population, popGrowthRate: z.popGrowthRate, accessScore: z.accessScore })),
      routes: snapshot.routes.map((r) => ({ id: r.id, name: r.name, mode: r.mode })),
      routeBoardings: snapshot.counters.routeBoardings,
      routePeakOcc: snapshot.counters.routePeakOcc,
      criticalRoutes: (critical ?? []).filter((c) => c.kind === 'route').map((c) => ({ id: c.id, label: c.label, score: c.score })),
      criticalBridges: (critical ?? []).filter((c) => c.kind === 'bridge').map((c) => ({ id: c.id, label: c.label, score: c.score })),
    }),
    [bottlenecks, gaps, snapshot, critical],
  );
  const recCtx: RecContext = useMemo(() => {
    const headway: Record<string, number> = {};
    for (const r of snapshot.routes) {
      const plan = snapshot.service[r.id];
      headway[r.id] = plan ? plan.peakHeadwayMin : r.headwayMin;
    }
    const zoneAccess: Record<string, number> = {};
    const zoneGrowth: Record<string, number> = {};
    for (const z of snapshot.city.zones) {
      zoneAccess[z.id] = z.accessScore;
      zoneGrowth[z.id] = z.popGrowthRate;
    }
    const edgeVC: Record<string, number> = {};
    for (const id in snapshot.edgeState) edgeVC[id] = snapshot.edgeState[id].vc;
    return {
      routePeakOcc: snapshot.counters.routePeakOcc,
      routeHeadway: headway,
      routeBoardings: snapshot.counters.routeBoardings,
      edgeVC,
      zoneAccess,
      zoneGrowth,
      transitAccessibility: access.cityScore,
      criticalRoutes: (critical ?? []).filter((c) => c.kind === 'route').map((c) => ({ id: c.id, label: c.label, score: c.score })),
      criticalBridges: (critical ?? []).filter((c) => c.kind === 'bridge').map((c) => ({ id: c.id, label: c.label, score: c.score })),
    };
  }, [snapshot, access, critical]);
  const overview = useMemo(() => {
    const totalReal = snapshot.demand.totalDaily * SIM_TRIPS_SCALE;
    const share = stats.transitShare / 100;
    return {
      population: stats.population,
      jobs: stats.jobs,
      transitDay: Math.round(totalReal * share),
      carDay: Math.round(totalReal * (1 - share)),
      transitShare: stats.transitShare,
      congestion: stats.avgCongestion,
      travelMin: stats.avgTravelMin,
      access: access.cityScore,
      resilience: null,
    };
  }, [snapshot, stats, access]);
  const topStations = useMemo(
    () => [...snapshot.stations].sort((a, b) => b.boardedDay - a.boardedDay).slice(0, 6).map((s) => ({ name: s.name, boarded: Math.round(s.boardedDay) })),
    [snapshot],
  );
  const demandLayers = useMemo(
    () => computeDemandLayers({
      zones: snapshot.city.zones,
      demand: snapshot.demand,
      connections: snapshot.connections,
      roadGraph: snapshot.roadGraph,
      zoneRoadAccess: snapshot.zoneRoadAccess,
      stations: snapshot.stations,
      routes: snapshot.routes,
    }),
    [snapshot],
  );
  const advice = useMemo(
    () => planAdvice({
      zones: snapshot.city.zones,
      stations: snapshot.stations,
      routes: snapshot.routes,
      counters: snapshot.counters,
      edgeState: snapshot.edgeState,
      roadGraph: snapshot.roadGraph,
      cityPopGrowth: snapshot.city.zones.reduce((s, z) => s + z.popGrowthRate * z.population, 0) /
        Math.max(1, snapshot.city.zones.reduce((s, z) => s + z.population, 0)),
    }),
    [snapshot],
  );
  const growthSummary = useMemo(() => {
    const zones = snapshot.city.zones;
    const pop = zones.reduce((s, z) => s + z.population, 0);
    const jobs = zones.reduce((s, z) => s + z.jobs, 0);
    const students = zones.reduce((s, z) => s + z.students, 0);
    const households = zones.reduce((s, z) => s + z.households, 0);
    const totalReal = snapshot.demand.totalDaily * SIM_TRIPS_SCALE;
    const share = stats.transitShare / 100;
    return {
      pop, jobs, students, households,
      developed01: pop > 0 ? zones.reduce((s, z) => s + z.developed01 * z.population, 0) / pop : 0,
      transitDay: Math.round(totalReal * share),
      carDay: Math.round(totalReal * (1 - share)),
      popRate: pop > 0 ? zones.reduce((s, z) => s + z.popGrowthRate * z.population, 0) / pop : 0,
      jobRate: pop > 0 ? zones.reduce((s, z) => s + z.jobGrowthRate * z.population, 0) / pop : 0,
    };
  }, [snapshot, stats]);
  const districtBars = useMemo(
    () => snapshot.city.zones.map((z) => ({ name: z.name, developed: z.developed01 })),
    [snapshot],
  );
  const analyticsView: AnalyticsView | null = useMemo(() => {
    const active =
      overlay === 'accessibility' || overlay === 'traveltime' || overlay === 'coverage' || overlay === 'bottlenecks' ||
      overlay === 'popdensity' || overlay === 'jobdensity' || overlay === 'development' || overlay === 'growth' || overlay === 'demand' ||
      overlay === 'critical';
    if (!active) return null;
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
    const popD: Record<string, number> = {};
    const jobD: Record<string, number> = {};
    const dev: Record<string, number> = {};
    const growth: Record<string, number> = {};
    const demand: Record<string, number> = {};
    let popMax = 1;
    let jobMax = 1;
    let growthMax = 0.001;
    let demandMax = 1;
    for (const z of snapshot.city.zones) {
      const area = Math.PI * z.radius * z.radius;
      popD[z.id] = z.population / Math.max(1, area);
      jobD[z.id] = z.jobs / Math.max(1, area);
      dev[z.id] = z.developed01;
      growth[z.id] = Math.max(0, z.popGrowthRate);
      const d = demandLayers[demandLayer][z.id] ?? 0;
      demand[z.id] = d;
      popMax = Math.max(popMax, popD[z.id]);
      jobMax = Math.max(jobMax, jobD[z.id]);
      growthMax = Math.max(growthMax, growth[z.id]);
      demandMax = Math.max(demandMax, d);
    }
    const criticalScores: Record<string, number> = {};
    if (overlay === 'critical') {
      for (const c of criticalityAnalysis({
        zones: snapshot.city.zones,
        stations: snapshot.stations,
        connections: snapshot.connections,
        routes: snapshot.routes,
        roadGraph: snapshot.roadGraph,
        zoneRoadAccess: snapshot.zoneRoadAccess,
        city: snapshot.city,
      })) criticalScores[c.id] = c.score;
    } else {
      for (const c of critical ?? []) criticalScores[c.id] = c.score;
    }
    return {
      grades,
      travel,
      travelMax,
      coverage: cov,
      bottleneckStations: bottlenecks.stations.slice(0, 5).map((b) => b.id),
      popD, popMax, jobD, jobMax, dev, growth, growthMax, demand, demandMax,
      criticalScores,
    };
  }, [overlay, access, coverage, bottlenecks, travelDest, snapshot, demandLayers, demandLayer, critical]);

  // ---- live service editing ----
  // Service edits apply to the running sim immediately (no day reset):
  // the plan is replaced, offsets recomputed, capacities updated, and the
  // fleet reconciled by adding/removing empty vehicles. The same change is
  // logged as a setService op so scenarios, undo, and compare stay exact.
  function onServicePatch(routeId: string, patch: ServicePatch) {
    const sim = simRef.current;
    const route = sim.routes.find((r) => r.id === routeId);
    const current = sim.service[routeId];
    if (!route || !current) return;
    const mode = route.mode === 'metro' || route.mode === 'rail' ? route.mode : 'bus';
    const next = mergeServicePatch(current, sanitizeServicePatch(patch, mode));
    sim.service[routeId] = next;
    sim.serviceOffsets[routeId] = phaseOffset(sim.seed, routeId, next);
    for (const vv of sim.vehicles) {
      if (vv.routeId === routeId) vv.capacity = next.vehicleCapacity;
    }
    reconcileFleet(sim, routeId);
    if (viewing === 'base') setViewing('scenario');
    const r = pushOp(ops, redo, { type: 'setService', routeId, patch: sanitizeServicePatch(patch, mode) });
    setOps(r.ops);
    setRedo(r.redo);
    setCompareResult(null);
    setSnapshot({ ...sim });
  }

  // ---- live fare editing ----
  // Fares apply to the running sim immediately (new boardings lock in the new
  // fare; trips already underway keep theirs) and are logged as a setFares op
  // so scenarios, undo, and compare stay exact. Like service edits, this does
  // not reset the day.
  function onFarePolicy(fares: FarePolicy) {
    const sim = simRef.current;
    const next = sanitizeFares(fares);
    sim.fares = next;
    if (viewing === 'base') setViewing('scenario');
    const r = pushOp(ops, redo, { type: 'setFares', fares: next });
    setOps(r.ops);
    setRedo(r.redo);
    setCompareResult(null);
    setSnapshot({ ...sim });
  }

  function reconcileFleet(sim: SimulationState, routeId: string) {
    const route = sim.routes.find((r) => r.id === routeId);
    const plan = sim.service[routeId];
    if (!route || !plan) return;
    const cum = sim.routeCumDist.get(routeId) ?? [0];
    const total = Math.max(1, cum[cum.length - 1]);
    const cycle = cycleMin(total, plan, route.stationIds.length, LOOP_ROUTES.has(routeId));
    const h = headwayAt(plan, sim.timeMinutes);
    const desired = plan.fleetSize > 0 ? plan.fleetSize : Number.isFinite(h) ? fleetRequired(cycle, h) : 0;
    const existing = sim.vehicles.filter((vv) => vv.routeId === routeId);
    if (existing.length < desired) {
      for (let i = existing.length; i < desired; i++) {
        fleetNonce.current++;
        sim.vehicles.push({
          id: `veh-${routeId}-${i}-n${fleetNonce.current}`,
          routeId,
          s: 0,
          direction: 1,
          load: 0,
          capacity: plan.vehicleCapacity,
          riders: [],
          dwellLeft: 0,
          trips: 0,
        });
      }
    } else if (existing.length > desired) {
      const removable = existing
        .filter((vv) => vv.riders.length === 0)
        .sort((a, b) => b.id.localeCompare(a.id));
      const drop = new Set(removable.slice(0, existing.length - desired).map((vv) => vv.id));
      if (drop.size > 0) sim.vehicles = sim.vehicles.filter((vv) => !drop.has(vv.id));
    }
  }

  // ---- disruptions ----
  const [incidentDraft, setIncidentDraft] = useState<IncidentDraft>(EMPTY_DRAFT);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [resilienceRows, setResilienceRows] = useState<CompareRow[] | null>(null);
  const [resilienceRunning, setResilienceRunning] = useState(false);

  function draftToConfig(d: IncidentDraft): IncidentConfig {
    const sev = d.severity === 'low' ? 0.3 : d.severity === 'medium' ? 0.6 : 0.9;
    const base = {
      id: '',
      label: incidentLabel(d, snapshot),
      startMin: Math.round(snapshot.timeMinutes + d.startInMin),
      durationMin: d.durationMin,
      recoveryMin: d.recoveryMin,
      severity01: sev,
    };
    switch (d.kind) {
      case 'station-closure':
        return { ...base, kind: d.kind, targetStationId: d.targetStationId };
      case 'segment-closure':
        return { ...base, kind: d.kind, targetRouteId: d.targetRouteId, segFrom: d.segFrom, segTo: d.segTo };
      case 'route-suspension':
        return { ...base, kind: d.kind, targetRouteId: d.targetRouteId };
      case 'reduced-service':
        return { ...base, kind: d.kind, targetRouteId: d.targetRouteId, headwayMult: d.headwayMult };
      case 'major-delay':
        return { ...base, kind: d.kind, targetRouteId: d.targetRouteId, delayMin: d.delayMin };
      case 'road-closure':
      case 'bridge-closure':
        return { ...base, kind: d.kind, edgeIds: d.edgeId ? [d.edgeId] : [] };
      case 'road-capacity':
        return { ...base, kind: d.kind, edgeIds: d.edgeId ? [d.edgeId] : [], capacityMult: d.capacityMult };
    }
  }

  function incidentLabel(d: IncidentDraft, sim: SimulationState): string {
    const route = sim.routes.find((r) => r.id === d.targetRouteId)?.name ?? d.targetRouteId;
    const station = sim.stations.find((s) => s.id === d.targetStationId)?.name ?? d.targetStationId;
    switch (d.kind) {
      case 'station-closure': return `${station || 'Station'} closure`;
      case 'segment-closure': return `${route || 'Route'} segment closure`;
      case 'route-suspension': return `${route || 'Route'} suspension`;
      case 'reduced-service': return `${route || 'Route'} reduced service`;
      case 'major-delay': return `${route || 'Route'} major delay`;
      case 'road-closure': return `Road closure ${d.edgeId}`;
      case 'road-capacity': return `Road capacity cut ${d.edgeId}`;
      case 'bridge-closure': return `Bridge closure ${d.edgeId}`;
    }
  }

  function validateDraft(d: IncidentDraft, sim: SimulationState): string | null {
    if (d.kind === 'station-closure' && !d.targetStationId) return 'Choose a station.';
    if ((d.kind === 'segment-closure' || d.kind === 'route-suspension' || d.kind === 'reduced-service' || d.kind === 'major-delay') && !d.targetRouteId) return 'Choose a route.';
    if (d.kind === 'segment-closure' && (!d.segFrom || !d.segTo || d.segFrom === d.segTo)) return 'Choose two different segment endpoints.';
    if ((d.kind === 'road-closure' || d.kind === 'road-capacity' || d.kind === 'bridge-closure') && !d.edgeId) return 'Choose a road.';
    const cfg = draftToConfig(d);
    const problems = validateIncidentConfig(
      cfg,
      new Set(sim.stations.map((s) => s.id)),
      new Set(sim.routes.map((r) => r.id)),
      new Set(sim.roadGraph.edges.map((e) => e.id)),
    );
    return problems.length > 0 ? problems.join('; ') : null;
  }

  function createIncident() {
    const sim = simRef.current;
    const problem = validateDraft(incidentDraft, sim);
    if (problem) return;
    const cfg = draftToConfig(incidentDraft);
    if (incidentDraft.withReplacement && (incidentDraft.kind === 'segment-closure' || incidentDraft.kind === 'route-suspension' || incidentDraft.kind === 'station-closure')) {
      const rep = replacementEndpoints(incidentDraft, sim);
      if (rep) {
        cfg.replacement = {
          fromStationId: rep[0],
          toStationId: rep[1],
          buses: Math.min(incidentDraft.repBuses, sim.emergencyBusesFree),
          headwayMin: incidentDraft.repHeadwayMin,
          capacity: 70,
        };
      }
    }
    const id = `inc-${sim.nextIncidentId}`;
    sim.nextIncidentId++;
    sim.incidents.push({
      ...cfg,
      id,
      status: 'scheduled',
      activeTicks: 0,
      baselineWaiting: 0,
      recovered90: false,
    });
    sim.events.push({ t: sim.timeMinutes, text: `${cfg.label} — scheduled for ${formatClock(cfg.startMin)}`, level: 'info' });
    setSelectedIncidentId(id);
    setIncidentDraft(EMPTY_DRAFT);
    setSnapshot({ ...sim });
  }

  /** Shuttle endpoints for a draft: closure span, or the station itself. */
  function replacementEndpoints(d: IncidentDraft, sim: SimulationState): [string, string] | null {
    if (d.kind === 'segment-closure' && d.segFrom && d.segTo) return [d.segFrom, d.segTo];
    if (d.kind === 'route-suspension' && d.targetRouteId) {
      const r = sim.routes.find((x) => x.id === d.targetRouteId);
      if (r && r.stationIds.length >= 2) return [r.stationIds[0], r.stationIds[r.stationIds.length - 1]];
    }
    if (d.kind === 'station-closure' && d.targetStationId) {
      const routes = sim.routes.filter((r) => r.stationIds.includes(d.targetStationId));
      const r = routes[0];
      if (!r) return null;
      const i = r.stationIds.indexOf(d.targetStationId);
      const a = r.stationIds[Math.max(0, i - 1)];
      const b = r.stationIds[Math.min(r.stationIds.length - 1, i + 1)];
      if (a !== b) return [a, b];
    }
    return null;
  }

  /** Fill the draft target from the current map selection. */
  function useSelectionForDraft() {
    const sel = selection;
    if (!sel) return;
    if (sel.kind === 'station') {
      const d = { ...incidentDraft };
      if (d.kind === 'station-closure') d.targetStationId = sel.id;
      else if (d.kind === 'segment-closure') {
        if (!d.segFrom) {
          d.segFrom = sel.id;
          d.segTo = '';
        } else if (d.segFrom !== sel.id) d.segTo = sel.id;
      }
      setIncidentDraft(d);
    } else if (sel.kind === 'route') {
      setIncidentDraft({ ...incidentDraft, targetRouteId: sel.id });
    } else if (sel.kind === 'road') {
      setIncidentDraft({ ...incidentDraft, edgeId: sel.id });
    }
  }

  function resolveIncident(id: string) {
    const sim = simRef.current;
    const inc = sim.incidents.find((i) => i.id === id);
    if (!inc) return;
    if (inc.status === 'scheduled') {
      sim.incidents = sim.incidents.filter((i) => i.id !== id);
      sim.events.push({ t: sim.timeMinutes, text: `${inc.label} — cancelled before start`, level: 'info' });
    } else if (inc.status === 'active') {
      // End now: recovery window starts immediately.
      inc.durationMin = Math.max(0, sim.timeMinutes - inc.startMin);
    }
    if (selectedIncidentId === id && inc.status !== 'active' && inc.status !== 'recovering') setSelectedIncidentId(null);
    setSnapshot({ ...sim });
  }

  function deployReplacementFor(id: string) {
    const sim = simRef.current;
    const inc = sim.incidents.find((i) => i.id === id);
    if (!inc || !inc.replacement || inc.replacementRouteId) return;
    const events = deployReplacement(sim, inc);
    for (const e of events) {
      sim.events.push(e);
      while (sim.events.length > 200) sim.events.shift();
    }
    setSnapshot({ ...sim });
  }

  function enterPlan() {
    setMode('plan');
  }

  function resetAll() {
    setZoneState(null);
    setYearsApplied(0);
    setGrowthHistory([]);
    setForecast(null);
    if (viewing === 'base') resetSimTo(baseCity, baseNet);
    else {
      const fresh = applyEdits(baseCity, baseNet, ops);
      resetSimTo(fresh.city, fresh);
    }
  }

  // ---- plan submit / save / export ----
  async function onSubmitPlan() {
    if (!activeBrief || submitting) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 30));
    const key = JSON.stringify({ ops, brief: activeBrief.id, horizon: planHorizon, incident: activeBrief.incident ?? null, seed: SEED });
    let ev = evalCache.current.get(key);
    if (!ev) {
      ev = evaluatePlan({
        seed: SEED,
        baseCity,
        baseNet,
        ops,
        objectives: activeBrief.objectives,
        constraints: activeBrief.constraints,
        horizonYears: planHorizon,
        incident: activeBrief.incident,
        coverageThreshold,
        transitShare01: 0.5,
      });
      if (evalCache.current.size > 10) evalCache.current.clear();
      evalCache.current.set(key, ev);
    }
    const report = buildReport({
      title: `Plan — ${activeBrief.title}`,
      briefTitle: activeBrief.title,
      briefParagraphs: activeBrief.paragraphs,
      horizonYears: planHorizon,
      objectives: activeBrief.objectives,
      objectiveResults: ev.objectiveResults,
      constraints: activeBrief.constraints,
      constraintResults: ev.constraintResults,
      comparisonRows: ev.rows,
      resilienceRows: ev.resilienceRows,
      intervention: ev.intervention,
      constructionCost: ev.mod.cost,
      opCost: ev.plan.stats.opCost,
      revenue: ev.plan.stats.revenue,
      subsidy: ev.plan.stats.subsidy,
      score: ev.score,
    });
    setEvaluation({ report, rows: ev.rows, resilienceRows: ev.resilienceRows, score: ev.score });
    if (activePlanId) {
      const plans = listPlans();
      const plan = plans.find((x) => x.id === activePlanId);
      if (plan) {
        plan.attempts.push({
          atClock: formatClock(simRef.current.timeMinutes),
          score: ev.score.total,
          passed: ev.passed,
          horizonYears: planHorizon,
          rows: ev.rows,
        });
        savePlan(plan);
        setPlans(listPlans());
      }
    }
    setSubmitting(false);
  }

  function onSavePlan(name: string) {
    const plan: SavedPlan = {
      id: makePlanId(),
      name,
      seed: SEED,
      briefId,
      ops: ops.map((o) => ({ ...o })),
      objectives: activeBrief?.objectives.map((o) => ({ ...o })) ?? [],
      constraints: activeBrief?.constraints.map((c) => ({ ...c })) ?? [],
      horizonYears: planHorizon,
      incident: activeBrief?.incident ? { ...activeBrief.incident } : undefined,
      createdAt: Date.now(),
      attempts: [],
    };
    savePlan(plan);
    setPlans(listPlans());
    setActivePlanId(plan.id);
  }

  function onLoadPlan(id: string) {
    const plan = listPlans().find((x) => x.id === id);
    if (!plan) return;
    setActivePlanId(id);
    setBriefId(plan.briefId);
    setBaselineBundle(null);
    setPlanHorizon(plan.horizonYears);
    setEvaluation(null);
    applyOps(plan.ops.map((o) => ({ ...o })), [], 'scenario');
    setViewing('scenario');
  }

  function onDeletePlan(id: string) {
    deletePlan(id);
    setPlans(listPlans());
    if (activePlanId === id) setActivePlanId(null);
  }

  function onExportJson() {
    if (!evaluation) return;
    const blob = new Blob([reportToJson(evaluation.report)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transitforge-plan-report.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function onExportHtml() {
    if (!evaluation) return;
    const html = reportToHtml(evaluation.report);
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
    } else {
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'transitforge-plan-report.html';
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  function onSelectBrief(id: string | null) {
    setBriefId(id);
    setEvaluation(null);
    if (id === null) {
      setBaselineBundle(null);
      return;
    }
    // Anchor progress bars to current live metrics.
    setBaselineBundle({
      stats,
      access,
      coverage,
      routePeakOcc: snapshot.counters.routePeakOcc,
      edgeVC: Object.fromEntries(Object.entries(snapshot.edgeState).map(([eid, st]) => [eid, st.vc])),
      resilienceScore: null,
      constructionCost: mod.cost,
    });
  }

  function onLocateProblem(pr: CityProblem) {
    if (pr.target) {
      setSelection({ kind: pr.target.kind, id: pr.target.id });
      if (pr.kind === 'growth' || pr.kind === 'access') setOverlay('popdensity');
      if (pr.kind === 'congestion') setOverlay('congestion');
      if (pr.kind === 'crowding') setOverlay('crowding');
    }
  }

  function boostFrequency(routeId: string) {
    const sim = simRef.current;
    const plan = sim.service[routeId];
    if (!plan) return;
    onServicePatch(routeId, {
      peakHeadwayMin: Math.max(3, Math.round(plan.peakHeadwayMin / 2)),
      offPeakHeadwayMin: Math.max(5, Math.round(plan.offPeakHeadwayMin / 2)),
    });
  }

  function applyPreset(key: string) {
    const sim = simRef.current;
    const presets = incidentPresets({ routes: sim.routes, stations: sim.stations, routeLengths: sim.routeLengths });
    const p = presets.find((x) => x.key === key);
    if (!p) return;
    const cfg = p.build(Math.round(sim.timeMinutes + 5));
    const id = `inc-${sim.nextIncidentId}`;
    sim.nextIncidentId++;
    sim.incidents.push({ ...cfg, id, status: 'scheduled', activeTicks: 0, baselineWaiting: 0, recovered90: false });
    sim.events.push({ t: sim.timeMinutes, text: `${cfg.label} — scheduled for ${formatClock(cfg.startMin)}`, level: 'info' });
    setSelectedIncidentId(id);
    setSnapshot({ ...sim });
  }

  function analyzeCritical() {
    const sim = simRef.current;
    setCritical(criticalityAnalysis({
      zones: sim.city.zones,
      stations: sim.stations,
      connections: sim.connections,
      routes: sim.routes,
      roadGraph: sim.roadGraph,
      zoneRoadAccess: sim.zoneRoadAccess,
      city: sim.city,
    }));
  }

  async function compareResilienceLive() {
    if (resilienceRunning) return;
    const sim = simRef.current;
    const inc = sim.incidents.find((i) => i.id === selectedIncidentId) ?? sim.incidents.find((i) => i.status === 'active');
    if (!inc) return;
    setResilienceRunning(true);
    await new Promise((r) => setTimeout(r, 30));
    const cfg: IncidentConfig = {
      id: inc.id,
      kind: inc.kind,
      label: inc.label,
      targetRouteId: inc.targetRouteId,
      targetStationId: inc.targetStationId,
      segFrom: inc.segFrom,
      segTo: inc.segTo,
      edgeIds: inc.edgeIds ? [...inc.edgeIds] : undefined,
      startMin: 500,
      durationMin: inc.durationMin,
      recoveryMin: inc.recoveryMin,
      severity01: inc.severity01,
      headwayMult: inc.headwayMult,
      delayMin: inc.delayMin,
      capacityMult: inc.capacityMult,
    };
    const cmp = compareResilience(SEED, baseCity, baseNet, mod.city, mod, cfg, 240);
    setResilienceRows(cmp.rows);
    setResilienceRunning(false);
  }

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
      const applied = applyEdits(effBaseCity, baseNet, nextOps);
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

  function enterDisrupt() {
    setMode('disrupt');
    setPlaying(false);
  }

  function enterSimulate() {
    setMode('simulate');
    clearDraft();
  }

  function selectMode(m: Mode) {
    if (m === mode) return;
    if (m === 'build') enterBuild();
    else if (m === 'disrupt') enterDisrupt();
    else if (m === 'plan') enterPlan();
    else {
      enterSimulate();
      setPlaying(true);
    }
  }

  function onView(v: 'base' | 'scenario') {
    setViewing(v);
    clearDraft();
    if (v === 'base') resetSimTo(effBaseCity, baseNet);
    else resetSimTo(mod.city, mod);
    setNetworkKey((k) => k + 1);
  }

  // ---- build interactions (from the 3D view) ----
  const stationPos = useMemo(() => new Map(snapshot.stations.map((s) => [s.id, { x: s.pos.x, z: s.pos.z }])), [snapshot]);
  const disruptPresets = useMemo(
    () => incidentPresets({ routes: snapshot.routes, stations: snapshot.stations, routeLengths: snapshot.routeLengths }),
    [snapshot],
  );

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

  // ---- city growth ----
  function structuralOf(sim: SimulationState) {
    return {
      stations: sim.stations,
      connections: sim.connections,
      routes: sim.routes,
      roadGraph: sim.roadGraph,
      edgeState: sim.edgeState,
      zoneRoadAccess: sim.zoneRoadAccess,
    };
  }

  async function onAdvanceYears(n: number) {
    if (growing) return;
    setGrowing(true);
    await new Promise((r) => setTimeout(r, 30));
    const sim = simRef.current;
    const share = sim.counters.completed + sim.roadCounters.completed > 0
      ? sim.counters.completed / (sim.counters.completed + sim.roadCounters.completed)
      : 0.5;
    const grown = growZones(sim.city.zones, structuralOf(sim), n, BASE_YEAR + yearsApplied, share);
    const newCity = { ...sim.city, zones: grown.zones };
    setZoneState(grown.zones);
    setYearsApplied((y) => y + n);
    setGrowthHistory((h) => [...h, ...grown.history]);
    setForecast(null);
    // Fresh day on the grown city (demand rebuilds from new population).
    if (viewing === 'base') resetSimTo(newCity, baseNet);
    else {
      const applied = applyEdits(newCity, baseNet, ops);
      resetSimTo(applied.city, applied);
      setNetworkKey((k) => k + 1);
    }
    setGrowing(false);
  }

  async function onForecast(years: number) {
    if (growing) return;
    setGrowing(true);
    await new Promise((r) => setTimeout(r, 30));
    const sim = simRef.current;
    const share = sim.counters.completed + sim.roadCounters.completed > 0
      ? sim.counters.completed / (sim.counters.completed + sim.roadCounters.completed)
      : 0.5;
    const fc = forecastGrowth(SEED, {
      zones: sim.city.zones,
      city: sim.city,
      stations: sim.stations,
      connections: sim.connections,
      routes: sim.routes,
      routeLengths: sim.routeLengths,
      routeCumDist: sim.routeCumDist,
      roadGraph: sim.roadGraph,
      edgeState: sim.edgeState,
      zoneRoadAccess: sim.zoneRoadAccess,
      service: sim.service,
      startYear: BASE_YEAR + yearsApplied,
      transitShare01: share,
    }, years);
    const totalReal = sim.demand.totalDaily * SIM_TRIPS_SCALE;
    setForecast({
      years: fc.years,
      history: fc.history,
      endStats: fc.endStats,
      endAccess: fc.endAccess,
      before: {
        pop: sim.city.zones.reduce((s, z) => s + z.population, 0),
        jobs: sim.city.zones.reduce((s, z) => s + z.jobs, 0),
        transitDay: Math.round(totalReal * share),
        carDay: Math.round(totalReal * (1 - share)),
        access: access.cityScore,
        congest: stats.avgCongestion,
        crowd: stats.maxOccupancy,
      },
    });
    setGrowing(false);
  }

  // ---- compare ----
  async function onRunCompare(horizon: number) {
    if (ops.length === 0 || compareRunning) return;
    setCompareRunning(true);
    if (horizon === 0) {
      setCompareProgress('base…');
      await new Promise((r) => setTimeout(r, 30));
      const cmp = compareScenarios(SEED, baseCity, baseNet, mod.city, mod, mod.cost, coverageThreshold);
      setCompareProgress('scenario…');
      await new Promise((r) => setTimeout(r, 30));
      setCompareResult({ rows: cmp.rows, base: cmp.base, mod: cmp.mod, baseScore: cmp.baseScore, modScore: cmp.modScore, impact: cmp.impact, horizonYears: 0 });
    } else {
      setCompareProgress(`growing ${horizon}y…`);
      await new Promise((r) => setTimeout(r, 30));
      const sim = simRef.current;
      const share = sim.counters.completed + sim.roadCounters.completed > 0
        ? sim.counters.completed / (sim.counters.completed + sim.roadCounters.completed)
        : 0.5;
      const hz = compareHorizons(SEED, sim.city.zones, baseCity, baseNet, mod.city, mod, mod.cost, horizon, share);
      setCompareProgress('scoring…');
      await new Promise((r) => setTimeout(r, 30));
      const hzBaseAccess = computeAccessibility({ zones: hz.base.zones, stations: baseNet.stations, connections: baseNet.connections, routes: baseNet.routes });
      const hzModAccess = computeAccessibility({ zones: hz.mod.zones, stations: mod.stations, connections: mod.connections, routes: mod.routes });
      const hzBaseCov = computeCoverage(hz.base.zones, baseNet.stations, coverageThreshold);
      const hzModCov = computeCoverage(hz.mod.zones, mod.stations, coverageThreshold);
      setCompareResult({
        rows: hz.rows,
        base: hz.base.stats,
        mod: hz.mod.stats,
        baseScore: planningScore(hz.base.stats, hzBaseAccess, hzBaseCov),
        modScore: planningScore(hz.mod.stats, hzModAccess, hzModCov),
        impact: populationImpact(hzBaseAccess, hzModAccess, sim.city.zones, hzBaseCov, hzModCov),
        horizonYears: horizon,
      });
    }
    setCompareRunning(false);
    setCompareProgress('');
  }

  // ---- build props for the 3D view ----
  function onResetPlan() {
    applyOps([], []);
  }

  function dismissTutorial() {
    try {
      localStorage.setItem('transitforge.tutorial.v1', 'done');
    } catch {
      // Ignore storage failures.
    }
    setTutorialDismissed(true);
  }
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
      : mode === 'disrupt'
        ? {
            pickKinds: ['station', 'route', 'road'] as Selection['kind'][],
            onPick: (sel: Selection) => {
              setSelection(sel);
              if (sel.kind === 'route') setServiceRouteId(sel.id);
              setIncidentDraft((prev) => {
                const d = { ...prev };
                if (sel.kind === 'station') {
                  if (d.kind === 'station-closure') d.targetStationId = sel.id;
                  else if (d.kind === 'segment-closure') {
                    if (!d.segFrom) { d.segFrom = sel.id; d.segTo = ''; }
                    else if (d.segFrom !== sel.id) d.segTo = sel.id;
                  }
                } else if (sel.kind === 'route') {
                  d.targetRouteId = sel.id;
                } else if (sel.kind === 'road') {
                  d.edgeId = sel.id;
                }
                return d;
              });
            },
            onMapClick: () => {},
            onHover: () => {},
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
    <div className={`tf-root${railOpen ? '' : ' rail-collapsed'}`}>
      <header className="tf-topbar">
        <div className="tf-brand">
          <span className="tf-brand-mark" aria-hidden="true">
            <IconPlan size={17} />
          </span>
          <span className="tf-brand-name">
            <b>TransitForge</b>
            <span>seed {SEED}</span>
          </span>
        </div>
        <ModeSwitch mode={mode} onChange={selectMode} />
        <div className="tf-hud-spacer" />
        <div className="tf-hud-right">
          <SimControls
            playing={playing}
            speed={speed}
            tick={snapshot.tick}
            timeMinutes={snapshot.timeMinutes}
            onToggle={() => {
              if (mode !== 'simulate') {
                enterSimulate();
                setPlaying(true);
              } else setPlaying((p) => !p);
            }}
            onSpeed={(s) => setSpeed(s)}
            onReset={resetAll}
            onStep={() => { simRef.current = stepSimulation(simRef.current, 1); setSnapshot(simRef.current); }}
          />
          <button
            type="button"
            className="tf-btn icon ghost"
            onClick={() => setRailOpen((r) => !r)}
            title={railOpen ? 'Hide side panel' : 'Show side panel'}
            aria-label={railOpen ? 'Hide side panel' : 'Show side panel'}
            aria-pressed={railOpen}
          >
            {railOpen ? <IconClose /> : <IconPlan />}
          </button>
        </div>
      </header>
      <main className="tf-main">
        <section className="tf-viewport">
          <SceneView
            simRef={simRef}
            layers={layers}
            overlay={overlay}
            selection={selection}
            onSelect={mode === 'build' ? () => {} : (sel) => {
              setSelection(sel);
              if (sel?.kind === 'route') setServiceRouteId(sel.id);
            }}
            networkKey={networkKey}
            ghosts={viewing === 'scenario' ? diff.removedStations : []}
            highlightRoutes={viewing === 'scenario' ? diff.addedRoutes : []}
            build={buildIx}
            draft={draftView}
            analytics={analyticsView}
          />
          <span className="tf-bracket tl" />
          <span className="tf-bracket tr" />
          <span className="tf-bracket bl" />
          <span className="tf-bracket br" />
          <div className="tf-hud-tl">
            <span className={`tf-hud-chip mode-${mode}`}>
              {MODE_LABEL[mode]} · {viewing === 'base' ? 'Baseline network' : 'Scenario network'}
            </span>
            {snapshot.incidents.filter((i) => i.status === 'active').map((i) => (
              <span className="tf-hud-chip alert" key={i.id}>
                {i.label} · {Math.max(0, Math.round(i.startMin + i.durationMin - snapshot.timeMinutes))}m left
              </span>
            ))}
            {stats.worstVC >= 0.85 && (
              <span className="tf-hud-chip alert">Congested: {stats.worstRoad} · V/C {stats.worstVC}</span>
            )}
          </div>
          <Toasts toasts={toasts} />
          <div className="tf-overlay-hint">
            {mode === 'build'
              ? 'build mode · sim paused · edits reset the day'
              : mode === 'disrupt'
                ? 'disrupt mode · sim paused · click infrastructure to target it'
                : mode === 'plan'
                  ? 'plan mode · pick a brief, build, then submit for evaluation'
                  : 'drag orbit · right-drag pan · wheel zoom · click station/route/road/district'}
          </div>
          <Legend overlay={overlay} demandLayer={demandLayer} />
          <StatusBar stats={stats} viewing={viewing} incidents={stats.activeIncidents} opCost={stats.opCost} />
          {selection && (
            <div className="tf-inspector-card">
              <Inspector selection={selection} sim={snapshot} onClose={() => setSelection(null)} />
            </div>
          )}
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
                demandLayer={demandLayer}
                onDemandLayer={setDemandLayer}
              />
              <StatsPanel stats={stats} />
              <ServicePanel
                sim={snapshot}
                selectedRouteId={serviceRouteId}
                onSelectRoute={setServiceRouteId}
                onPatch={onServicePatch}
                onFares={onFarePolicy}
              />
              <AnalyticsPanel
                access={access}
                coverage={coverage}
                score={score}
                bottlenecks={bottlenecks}
                gaps={gaps}
                utilization={utilization}
                sim={snapshot}
                onSelect={setSelection}
              />
              <ChartsPanel history={history} topStations={topStations} />
              <GrowthPanel
                year={BASE_YEAR + yearsApplied}
                summary={growthSummary}
                districts={districtBars}
                history={growthHistory}
                onAdvance={onAdvanceYears}
                advancing={growing}
                forecast={forecast}
                onForecast={onForecast}
                advice={advice}
              />
              <DebugPanel sim={snapshot} />
            </>
          ) : mode === 'disrupt' ? (
            <>
              <DisruptPanel
                sim={snapshot}
                draft={incidentDraft}
                onDraft={setIncidentDraft}
                onCreate={createIncident}
                onUseSelection={useSelectionForDraft}
                selection={selection}
                incidents={snapshot.incidents}
                selectedIncidentId={selectedIncidentId}
                onSelectIncident={setSelectedIncidentId}
                onResolve={resolveIncident}
                onDeployReplacement={deployReplacementFor}
                onBoostFrequency={boostFrequency}
                presets={disruptPresets}
                onPreset={applyPreset}
                critical={critical}
                onAnalyze={analyzeCritical}
                resilienceRows={resilienceRows}
                resilienceRunning={resilienceRunning}
                onCompareResilience={compareResilienceLive}
              />
            </>
          ) : mode === 'plan' ? (
            <>
              <PlanningPanel
                briefs={briefs}
                briefId={briefId}
                onSelectBrief={onSelectBrief}
                difficulty={difficulty}
                onDifficulty={setDifficulty}
                objectives={activeBrief?.objectives ?? []}
                liveResults={liveObjectiveResults}
                constraints={activeBrief?.constraints ?? []}
                liveConstraints={liveConstraintResults}
                horizonYears={planHorizon}
                onHorizon={setPlanHorizon}
                onSubmit={onSubmitPlan}
                submitting={submitting}
                evaluation={evaluation}
                overview={overview}
                problems={problems}
                onLocateProblem={onLocateProblem}
                recCtx={recCtx}
                plans={plans}
                onSavePlan={onSavePlan}
                onLoadPlan={onLoadPlan}
                onDeletePlan={onDeletePlan}
                onExportJson={onExportJson}
                onExportHtml={onExportHtml}
                onResetPlan={onResetPlan}
                hasOps={ops.length > 0}
                tutorialSteps={tutorialSteps}
                tutorialDismissed={tutorialDismissed}
                onDismissTutorial={dismissTutorial}
              />
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
                horizonYears={compareHorizon}
                onHorizon={setCompareHorizon}
              />
            </>
          )}
        </aside>
      </main>
    </div>
  );
}
