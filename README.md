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

- v0.4 multimodal traffic: real road graph (capacity, free-flow, BPR behind a
  replaceable interface), deterministic logit mode choice (time, transfers,
  CBD parking, airport bonus), lightweight car trips on road routes with
  TTL-cached congested routing, diurnal background + simulated congestion,
  bus slowdown from mapped road edges, CONGESTION overlay (5 levels),
  representative car subset rendering, road inspection, Roads + Multimodal
  dashboard sections, debug panel. 26 tests passing.
- Next: world-scale pass, scenario editing.

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
