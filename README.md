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

- v0.2 vertical slice: deterministic seeded coastal city (10 districts, river +
  3 bridges, arterials, ~1300 instanced buildings), real transport data model
  (M1/M2 metro, R1 rail, B1/B2/B3 bus, 14 stations, 3 interchanges), Dijkstra
  graph routing, sim clock (play/pause/1×/5×/20×/reset), 9 live vehicles,
  orbit/pan/zoom, layer toggles, station/route/district inspector.
- Next: O/D passenger demand + congestion + overlays + full dashboard.

## Test

```sh
npm run test   # determinism, graph validity + routing, clock advance
```

## Principle

A metro line must exist in the simulation model. Stations have demand. Routes affect
travel times. Network edits must be capable of changing simulation results.
