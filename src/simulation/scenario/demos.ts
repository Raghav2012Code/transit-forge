// Curated demo scenarios. Pure data built only from the existing scenario
// system (ops, objectives, constraints, incidents) — opening a demo replays
// it exactly like a player-made scenario, so demos can never drift from what
// the app can actually do. Overlay stays a plain string here so the
// simulation layer never imports rendering types; the UI validates it.
import type { FarePolicy } from '../economics/fares.ts';
import type { Objective, PlanConstraint } from '../planning/objectives.ts';
import type { Difficulty } from '../planning/briefs.ts';
import type { EditOp } from './scenario.ts';

export type DemoAction =
  | 'inspect-central'
  | 'show-demand'
  | 'show-access'
  | 'show-crowding'
  | 'enter-build'
  | 'run-sim';

export interface DemoSuggestion {
  label: string;
  action: DemoAction;
}

export interface DemoScenario {
  id: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  /** Honest estimate for a first playthrough. */
  minutes: number;
  systems: string[];
  ops: EditOp[];
  briefId: string | null;
  objectives: Objective[];
  constraints: PlanConstraint[];
  /** Years of city growth applied when the demo opens (0 = pristine). */
  growthYears: number;
  overlay: string;
  travelDest: string;
  fares: FarePolicy | null;
  intro: string[];
  suggestions: DemoSuggestion[];
}

function obj(
  id: string,
  title: string,
  category: Objective['category'],
  metric: Objective['metric'],
  op: Objective['op'],
  target: number,
  targetId?: string,
): Objective {
  return { id, title, description: title, category, metric, op, target, horizonYears: 0, ...(targetId ? { targetId } : {}) };
}

export const DEMOS: DemoScenario[] = [
  {
    id: 'demo-downtown',
    title: 'Growing Downtown',
    description: 'The CBD is getting busier every month. Morning platforms at Central Interchange are near capacity — add service before crowding turns into denied boardings.',
    difficulty: 'easy',
    minutes: 10,
    systems: ['service planning', 'crowding', 'accessibility', 'scenario comparison'],
    ops: [
      { type: 'setService', routeId: 'rt-m1', patch: { peakHeadwayMin: 4 } },
      { type: 'setService', routeId: 'rt-m2', patch: { peakHeadwayMin: 4 } },
    ],
    briefId: 'overcrowding',
    objectives: [
      obj('d1-crowd', 'Peak crowding below 85%', 'capacity', 'peak-crowding', '<', 85),
      obj('d1-wait', 'Average wait below 6 min', 'capacity', 'avg-wait', '<', 6),
    ],
    constraints: [{ id: 'd1-budget', label: 'No construction spending', kind: 'budget', limit: 0 }],
    growthYears: 0,
    overlay: 'crowding',
    travelDest: 'cbd',
    fares: null,
    intro: [
      'Central Interchange is the busiest station in the city. Two metro lines already run every 5 minutes — your head start.',
      'Watch the crowding overlay during the morning peak, then submit your plan when both objectives pass.',
    ],
    suggestions: [
      { label: 'Inspect Central interchange', action: 'inspect-central' },
      { label: 'View crowding', action: 'show-crowding' },
      { label: 'Run simulation', action: 'run-sim' },
    ],
  },
  {
    id: 'demo-airport',
    title: 'Airport Connection',
    description: 'Aurora Airport is booming but only reachable by rail with a long ride. Extend the B2 Campus Bus to the airport and give the east side a one-seat ride.',
    difficulty: 'medium',
    minutes: 15,
    systems: ['route planning', 'accessibility analysis', 'mode choice', 'travel times'],
    ops: [{ type: 'extendRoute', routeId: 'rt-b2', stationIds: ['st-airport'] }],
    briefId: 'airport-expansion',
    objectives: [
      obj('d2-access', 'Airport district accessibility above 55', 'accessibility', 'access-zone', '>', 55, 'z-air'),
      obj('d2-car', 'Car share below 50%', 'mode-share', 'car-share', '<', 50),
    ],
    constraints: [{ id: 'd2-stations', label: 'At most 3 new stations', kind: 'stations', limit: 3 }],
    growthYears: 0,
    overlay: 'traveltime',
    travelDest: 'airport',
    fares: null,
    intro: [
      'The airport sits at the eastern edge with jobs but weak transit. A single bus extension changes its travel-time map completely.',
      'Compare travel times to the airport before and after, then submit.',
    ],
    suggestions: [
      { label: 'Show airport travel times', action: 'show-access' },
      { label: 'Enter Build mode', action: 'enter-build' },
      { label: 'Run simulation', action: 'run-sim' },
    ],
  },
  {
    id: 'demo-corridor',
    title: 'Congested Corridor',
    description: 'The crosstown arterial is saturated and buses sit in the same jam as cars. Invest in parallel transit frequency to pull drivers off the road.',
    difficulty: 'medium',
    minutes: 15,
    systems: ['road traffic', 'bus delays', 'modal shift', 'transit investment'],
    ops: [
      { type: 'setService', routeId: 'rt-b3', patch: { peakHeadwayMin: 8 } },
      { type: 'setService', routeId: 'rt-m1', patch: { peakHeadwayMin: 4 } },
    ],
    briefId: 'cbd-congestion',
    objectives: [
      obj('d3-cong', 'Average congestion below 0.75', 'congestion', 'congestion', '<', 0.75),
      obj('d3-share', 'Transit share above 45%', 'mode-share', 'transit-share', '>', 45),
    ],
    constraints: [{ id: 'd3-op', label: 'Operating cost under 60,000 OCU/day', kind: 'op-cost', limit: 60000 }],
    growthYears: 0,
    overlay: 'congestion',
    travelDest: 'cbd',
    fares: null,
    intro: [
      'Road congestion is a transit problem in disguise: every driver who switches to the crosstown bus removes a car from the jam.',
      'Boost parallel service and watch the congestion overlay respond.',
    ],
    suggestions: [
      { label: 'Show congestion', action: 'show-crowding' },
      { label: 'View passenger demand', action: 'show-demand' },
      { label: 'Run simulation', action: 'run-sim' },
    ],
  },
  {
    id: 'demo-resilience',
    title: 'Transit Resilience',
    description: 'A morning closure hits Central Interchange — the station every line depends on. Keep the city moving with reroutes and replacement buses.',
    difficulty: 'hard',
    minutes: 15,
    systems: ['incident system', 'rerouting', 'replacement service', 'resilience analytics'],
    ops: [
      {
        type: 'scheduleIncident',
        incident: {
          id: '', kind: 'station-closure', label: 'Central Interchange closure',
          targetStationId: 'st-central', startMin: 480, durationMin: 60,
          recoveryMin: 15, severity01: 0.8,
          replacement: { fromStationId: 'st-mid-north', toStationId: 'st-park-east', buses: 6, headwayMin: 6, capacity: 70 },
        },
      },
    ],
    briefId: 'network-resilience',
    objectives: [
      obj('d4-denied', 'Denied boardings below 400', 'capacity', 'denied', '<', 400),
      obj('d4-wait', 'Average wait below 9 min during disruption', 'capacity', 'avg-wait', '<', 9),
    ],
    constraints: [{ id: 'd4-budget', label: 'No construction spending', kind: 'budget', limit: 0 }],
    growthYears: 0,
    overlay: 'status',
    travelDest: 'cbd',
    fares: null,
    intro: [
      'At 08:00 Central Interchange closes for an hour. Six replacement buses are staged — deploy them from the Disrupt panel.',
      'Your goal is not perfection: keep waits and denied boardings inside the objectives while the network heals.',
    ],
    suggestions: [
      { label: 'Inspect Central interchange', action: 'inspect-central' },
      { label: 'Run simulation', action: 'run-sim' },
      { label: 'Enter Build mode', action: 'enter-build' },
    ],
  },
  {
    id: 'demo-growth',
    title: 'Long-Term Growth',
    description: 'South Suburbs will add thousands of residents over the next decade with only one rail line serving it. Build the M3 metro before demand overwhelms the network.',
    difficulty: 'medium',
    minutes: 20,
    systems: ['city growth', 'future demand', 'accessibility', 'infrastructure planning'],
    ops: [
      {
        type: 'addRoute',
        route: {
          id: 'rt-um3', name: 'M3 Metro South', mode: 'metro', color: '#22d3ee',
          stationIds: ['st-south-sub', 'st-industrial', 'st-east-res'],
          headwayMin: 6, speedKph: 32, vehicleCapacity: 800,
        },
      },
    ],
    briefId: 'suburbanization',
    objectives: [
      obj('d5-access', 'South Suburbs accessibility above 55', 'accessibility', 'access-zone', '>', 55, 'z-sub-s'),
      obj('d5-crowd', 'Peak crowding below 90%', 'capacity', 'peak-crowding', '<', 90),
    ],
    constraints: [{ id: 'd5-budget', label: 'Construction under ₹2,000Cr', kind: 'budget', limit: 20000_000_000 }],
    growthYears: 10,
    overlay: 'growth',
    travelDest: 'cbd',
    fares: null,
    intro: [
      'This demo starts ten years in the future: the south has grown, and the old network is straining. A new M3 metro is drafted — refine it.',
      'Use the growth overlay to see where the people went, then plan around them.',
    ],
    suggestions: [
      { label: 'View passenger demand', action: 'show-demand' },
      { label: 'Show accessibility', action: 'show-access' },
      { label: 'Enter Build mode', action: 'enter-build' },
    ],
  },
];

export function demoById(id: string): DemoScenario | null {
  return DEMOS.find((d) => d.id === id) ?? null;
}
