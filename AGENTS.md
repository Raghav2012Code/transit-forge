# TransitForge

Browser-based 3D public transportation planning and simulation sandbox:
TypeScript, React, Vite and Three.js (no game engine).

## Architecture

Three separated layers:

1. `src/simulation/` — pure TypeScript. City data, zones, graph, routes, demand,
   routing (Dijkstra/A*), ticks, loads, statistics. No React / Three.js imports.
2. `src/rendering/` — Three.js only. Consumes simulation state, no sim logic.
3. `src/ui/` — React dashboard, controls, inspectors. No sim logic inside components
   beyond calling the simulation API.

Supporting folders: `src/types/`, `src/data/`, `src/workers/`.

## Interface

Read [`DESIGN.md`](DESIGN.md) before changing any UI, colour, type or motion; it
wins over the code when they disagree. Tokens and primitives live in
`src/index.css`, shell and component styles in `src/App.css`.

Check every change against one rule: **colour only ever means a line or a
condition; selection is ink.**

Light and dark ship as one design:

- Components read tokens and stay theme-blind. Colours come from `src/index.css`
  (a token, or a custom property where a token cannot reach, such as SVG and
  gradients), so a value changes in one place for both themes.
- The 3D scene takes its colours from `src/rendering/palette.ts`, one palette per
  theme. Switching theme rebuilds the scene from the other palette, so a new scene
  colour goes in both.
- Check a UI change in both themes (`T` switches) and at 390px before it lands.

## Working agreements

- The simulation is deterministic: seed `1337`, no `Math.random()` in
  `src/simulation/`. A change that alters results must be able to explain why.
- Extend a type instead of weakening it to `any`.
- Keep analytics out of the frame loop: compute per tick-band or on demand, never
  per passenger or per frame.
- Milestones land as one commit each, once `npm run lint`, `npm run test` and
  `npm run build` are all clean.
- Keyboard shortcuts are handled by `onKey` in `src/App.tsx` and listed for
  people in `src/ui/shell/shortcuts.ts` (the `?` sheet); change both together.
  An action that can be done should also be a command in `buildCommands`.

## Git

`origin` is the fork (`abivan100-stack/transit-forge`). `upstream` is the parent
(`Raghav2012Code/transit-forge`), where the fork has read access only. Work lands
on the fork's `main` through a pull request, and reaches the parent as a pull
request from the fork's `main`.

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
