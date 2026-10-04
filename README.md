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

- v0.9 disruptions & resilience: 8 incident kinds (station/segment/route/
  service/delay/road/capacity/bridge) with scheduled→active→recovering→
  resolved lifecycle, Disrupt mode with map targeting, live rerouting with
  STRANDED state + 45-min abandon, vehicle hold/park/terminate, boarding
  guards, replacement shuttles from a 12-bus pool, road closures with car
  replan + abandon, transparent resilience scores, structural criticality +
  redundancy analysis, resilience-vs-base compare, status overlay + markers,
  event timeline. 87 tests passing. Verified: segment closure → 102 rerouted,
  network-wide road congestion, full recovery with measured deltas.
- Next: advanced economics.

## Known limitations (v0.4 candidates)

- World geography is compact (~1.2 km across), so absolute travel times read
  low (a few minutes cross-city). A world-scale pass (×5–6 coordinates with
  matched camera/fog/building density) should precede any fare/economics work.
- Buses run ping-pong/loop approximations; no dwell timetables or headway
  control yet. No congestion/BPR, no scenario editing.

## Test

```sh
npm run test   # determinism, graph validity + routing, clock advance
```

## Principle

A metro line must exist in the simulation model. Stations have demand. Routes affect
travel times. Network edits must be capable of changing simulation results.
