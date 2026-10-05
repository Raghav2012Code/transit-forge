# TransitForge agent skills

TransitForge — browser-based 3D public transportation planning and simulation
sandbox.

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

## Run

```sh
npm install
npm run dev
```

Build and verify:

```sh
npm run lint    # oxlint
npm run test    # vitest run
npm run build   # tsc -b && vite build
```

## Working agreements

- The simulation is deterministic: seed `1337`, no `Math.random()` in
  `src/simulation/`. A change that alters results must be able to explain why.
- Never weaken a type to `any`; extend the type instead.
- Keep analytics out of the frame loop: compute per tick-band or on demand, never
  per passenger or per frame.
- Milestones land as one commit each, after lint + test + build are clean.

## Controls

| Key | Action |
| --- | --- |
| `Space` | play / pause (leaves build · disrupt · plan) |
| `1` `2` `3` | speed 1× / 5× / 20× |
| `B` `D` `P` | build · disrupt · plan mode |
| `A` | cycle the analytics overlay |
| `T` | switch light / dark theme |
| `[` `]` | hide / show the side panel |
| `Esc` | back to simulate |
| `R` | reset the simulated day |

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues on `Raghav2012Code/transit-forge`, driven
through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles with matching label names: `needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, `wontfix`. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the repo root plus `docs/adr/`. See
`docs/agents/domain.md`.