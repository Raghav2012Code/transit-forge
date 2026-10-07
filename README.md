# TransitForge

TransitForge — browser-based 3D public transportation planning and simulation sandbox.

## Stack

- TypeScript + React + Vite
- Three.js (no game engine)
- HTML/CSS, Web Workers when needed for simulation performance

## Architecture

Three separated layers:

1. `src/simulation/` — pure TypeScript. City data, zones, graph, routes, demand,
   routing (Dijkstra/A*), ticks, loads, statistics. No React / Three.js imports.
2. `src/rendering/` — Three.js only. Consumes simulation state, no sim logic.
3. `src/ui/` — React dashboard, controls, inspectors. No sim logic inside components
   beyond calling the simulation API.

Supporting folders: `src/types/`, `src/data/`, `src/workers/`.

Interface: design tokens and primitives live in `src/index.css`, shell and
component styles in `src/App.css`, and the committed design direction (palette,
type, motion, slop audit) is recorded in [`DESIGN.md`](DESIGN.md).

## Controls

| Key | Action |
| --- | --- |
| `Space` | play / pause (leaves build · disrupt · plan) |
| `1` `2` `3` | speed 1× / 5× / 20× |
| `B` `D` `P` | build · disrupt · plan mode |
| `A` | cycle the analytics overlay |
| `[` `]` | hide / show the side panel |
| `Esc` | back to simulate |
| `R` | reset the simulated day |

## Run

```sh
npm install
npm run dev
```

Build:

```sh
npm run build
```

## Status

Current version: 1.3.0 (`src/version.ts`).

- v0.9 disruptions & resilience: 8 incident kinds (station/segment/route/
  service/delay/road/capacity/bridge) with scheduled→active→recovering→
  resolved lifecycle, Disrupt mode with map targeting, live rerouting with
  STRANDED state + 45-min abandon, vehicle hold/park/terminate, boarding
  guards, replacement shuttles from a 12-bus pool, road closures with car
  replan + abandon, transparent resilience scores, structural criticality +
  redundancy analysis, resilience-vs-base compare, status overlay + markers,
  event timeline. Verified: segment closure → 102 rerouted,
  network-wide road congestion, full recovery with measured deltas.
- v1.2 economics: per-mode flat fares (OCU, entry-mode pricing, transfers free)
  with live steppers, fare locked at boarding, revenue counted from completions
  only (denied/stranded/cancelled earn nothing), cost recovery + subsidy in
  stats, Finance section, and status strip, elasticity in mode choice (smooth,
  bounded, zero-fare baseline bit-identical), per-route revenue/recovery/
  break-even hints, revenue + cost-recovery objectives, subsidy-cap constraint,
  setFares scenario op with undo/redo + compare + report coverage (FINANCE
  section in text/HTML/JSON). Free-transit default preserves all baselines.
- v1.1.1 vehicle-path fix: vehicle meshes ride the same smoothed curve the
  route-line tube is drawn from (fraction-of-route mapping, timing unchanged);
  replacement shuttles deployed mid-day now get path entries so they render
  on their line.
- v1.0 planning campaign: objectives + constraints evaluated against live and
  simulated metrics, 7 procedural briefs with difficulty tiers, ranked city
  problems with drill-down, rule-based recommendations with Why, intervention
  summaries, plan save/load/attempts with multi-plan compare, structured
  reports (JSON/text/printable HTML), tutorial checklist, keyboard shortcuts,
  Plan mode, criticality overlay, live objective progress, resilience
  objectives via real disruption sims.
- v1.1 interface overhaul ("control room" design pass, see `DESIGN.md`):
  OKLCH token system, Space Grotesk + IBM Plex Mono typography, segmented
  mode/overlay controls, HUD bar with brand lockup and clock, pinned status
  strip, viewport corner brackets + vignette, HUD chip stack (mode, active
  incidents, worst congestion), event toasts, overlay legend matching the real
  scene ramps, floating selection card, collapsible rail docks, KPI tiles with
  segmented tick meters, `[` panel toggle, `D` disrupt shortcut.

## Known limitations

- World geography is compact (~1.2 km across), so absolute travel times read
  low (a few minutes cross-city). A world-scale pass (×5–6 coordinates with
  matched camera/fog/building density) should precede any fare/economics work.
- Vehicles are drawn on each line's display schedule rather than at their
  simulation positions, because the map is compact (`docs/adr/0001`). The
  simulation itself spends each tick as a time budget per vehicle: it stops at
  every station and pays that stop's dwell (`docs/adr/0002`).

## Test

```sh
npm run test   # determinism, graph validity + routing, clock advance
```

## Principle

A metro line must exist in the simulation model. Stations have demand. Routes affect
travel times. Network edits must be capable of changing simulation results.
