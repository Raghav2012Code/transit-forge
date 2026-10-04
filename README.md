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

- v0.8 city growth: land-use capacity per district, deterministic yearly
  growth (lagged accessibility memory, city-relative attractiveness, logistic
  capacity dampening, fixed city budget — no runaway), trip purposes on all
  trips, demand auto-regenerates from population, separate growth clock
  (+1/5/10/20y advances), horizon compare (1/5/10/20y base-vs-scenario with
  population/jobs/ridership/access rows), labeled forecasts, density/
  development/growth/demand heatmaps, demand purpose layers, district growth
  inspector, warnings + rule-based recommendations, timeline charts.
  70 tests passing. Verified: 5y → pop +10.4%, demand +10.4%; airport express
  5y → access +0.8, transit +2.2pp, crowding +25%.
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
