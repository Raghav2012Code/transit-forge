# Bug sweep

Full read of `src/simulation`, `src/rendering` and `src/ui` to find defects that
produce wrong results, crashes, non-determinism or broken interactions. Every
finding below was confirmed by reading the code and its callers first; anything
that could not be triggered from real input was left out or marked deferred.

Baseline before the sweep: lint clean, 218 tests passing, build clean.

## The test that guards all of this

`src/simulation/tests/golden.test.ts` pins the FNV hash of a 360- and 1020-tick
undisrupted day. Every fix in the "inert on a normal day" group below must leave
that hash untouched. If it moves, a fix is not inert and is wrong.

## Fixed — inert on a normal day

### Rendering and interface

1. **Station emissive latched.** `SceneView.tsx:1154` writes `mat.color` every
   frame but only ever *sets* `mat.emissive` inside the bottleneck / status /
   critical / selected branches, with no branch restoring the base glow. A
   station clicked once stayed amber forever; lens flags never cleared.
   Fix: reset `mat.emissive` to `STATION.glow` before the branches.
2. **Stale camera command replayed after a rebuild.** `SceneView.tsx:923`
   re-initialised `appliedCamSeq = 0`, so the first frame after any scene
   rebuild re-applied the last focus/preset and yanked the camera back. This
   contradicted `DESIGN.md` ("the view does not jump").
   Fix: seed `appliedCamSeq` from the ref's current seq.
3. **`Ctrl`+letter fired app shortcuts.** `App.tsx:457` `b d a p i f 0 [ ] r`
   had no `mod` guard (`t s m` did), so Ctrl+A changed the lens *and*
   select-all, Ctrl+F focused the selection *and* opened find, etc.
   Fix: require `!mod && !e.altKey` on every plain-key case.
4. **`computeStats` ran on every render.** `App.tsx:554` was the one analytics
   call not memoised, recomputed on every hover/clock/toast render.
   Fix: `useMemo` on `snapshot`.
5. **Canvas label and measure textures leaked.** `SceneView.tsx:708, 796`
   created `CanvasTexture`s per scene; the teardown disposed geometries and
   materials but not material maps. Every theme switch or scenario edit leaked
   one texture per label. The shared building atlas must not be touched.
   Fix: track the per-scene textures and dispose exactly those.
6. **`I`, `A` and `/` were in the shortcut sheet but not in `buildCommands`.**
   `AGENTS.md` requires both. Fix: add an inspect command (`I`), give the
   accessibility lens command `A`, add a search command (`/`).
7. **`[` toggled instead of hiding.** `App.tsx:477` toggled while the sheet and
   tooltip say "Hide the side panel". Fix: `[` hides, `]` shows.
8. **Help sheet stole focus twice a second.** `HelpSheet.tsx:14` depended on
   `onClose`, which `App.tsx` passes as a fresh inline arrow, so the effect
   re-ran and re-focused the dialog on every render while the day played.
   Fix: hold the handler in a ref, depend on nothing.
9. **Day strip `aria-valuenow` fell below `aria-valuemin`.** `DayStrip.tsx:93`
   reported the raw minute-of-day (0–1439) against a 04:00 floor. Fix: clamp.
10. **`Ctrl+Y` redo was implemented but undocumented.** `App.tsx:444`; add it
    to the shortcut sheet and the redo command.

### Simulation

11. **Withdrawing a replacement left riders holding a dead leg.**
    `incidents.ts:417` set offloaded riders to `WAITING` at an end station but
    never replanned, and the route they still referenced was deleted. Replanning
    only ran inside `if (w.closures.active)` (`passengers.ts:346`), so once the
    incident resolved the riders waited forever with a leg on a route that no
    longer existed.
    Fix: run the leg check when the route is missing too, not only under a
    closure, so an orphaned leg always replans or strands. Kept cheap: with no
    closure and a live route the loop `continue`s after one map lookup.
12. **Passengers at a closed station rerouted every tick.** `replanFromStation`
    (`passengers.ts:133`) happily replanned *from* the closed station because
    `findShortestPath` allows the start node, so the next tick flagged it again
    and `counters.rerouted` climbed every tick without the passenger ever
    moving or stranding.
    Fix: return false (strand) when the origin station is closed.
13. **`st.waiting` counted `STRANDED` passengers.** `passengers.ts:476` counted
    `WAITING|TRANSFERRING|STRANDED` while `computeStats.waitingNow` and the
    tested contract (`passengers.test.ts:62`) count only the first two, so
    station load, crowding and bottleneck metrics over-reported during any
    disruption. Fix: exclude `STRANDED`.
14. **Vehicle-hours charged for parked vehicles.** `passengers.ts:432` accrued
    `routeVehHr` before the `held` branch, so a suspended route kept billing
    operating cost for service it did not run. Fix: skip parked routes only;
    a vehicle held short of a closure is still in service.
15. **A car crossed a slow edge faster than physics allowed.** `cars.ts:278`
    divided by `Math.max(1, speedMpm)` while the sibling branch used the true
    `speedMpm`; on a short or heavily congested edge (`speedMpm < 1`) the
    elapsed time was undercharged and the car jumped ahead. Fix: use the real
    speed in both branches.

## Deferred — needs your call

- **Boarding ignores travel direction on an open network.** `incidents.ts:263`
  returns true immediately when `!closures.active` ("legacy"), so in normal
  operation a rider can board a vehicle heading away from their alight stop and
  ride to the terminus and back. This is a real correctness bug, but fixing it
  changes normal-operation results and so rewrites the pinned golden hashes.
  It is the owner's call whether to re-record them.
- Latent, no live trigger: `routeCumDist` index misalignment if a hop endpoint
  is missing (`network.ts:150`); `stepSimulation` is documented immutable but
  mutates its input (`index.ts:267`); `Date.now()` used for scenario and plan
  ids inside `src/simulation` (`scenario.ts:107`, `planStore.ts:69`).

## Checked and found correct

- The critical lens "recompute" flagged on first read is not a bug:
  `analyzeCritical()` runs only on demand (`App.tsx:2570`), so the inline
  compute in `analyticsView` is what makes the lens work before Analyze is
  pressed. Left as is.

## Second sweep — the modules round one did not cover

Round one covered the passenger, incident, traffic and statistics modules, the
scene, and the keyboard/command layer. This pass covered the rest: planning,
analytics, economics, growth, service, scenario, the app shell and persistence.

### Fixed

**Planning verdicts**
- The `congestion` objective metric read a 0–2 V/C **ratio** while every brief
  targets 75–80 **percent**, so "Peak road congestion < 75%" also passed in a
  saturated city. `objectives.ts` now reads it as a percentage with a `%` unit.
- The `su-pop` growth objective compared a **single zone's** projected
  population against the **city-wide** total, so it always passed. A zone
  population is now read when the objective names one (`objectives.ts`), the
  brief names the zone (`briefs.ts`), and both bundles carry per-zone
  populations (`evaluate.ts`, `App.tsx`).
- The plan-evaluation cache key omitted difficulty, coverage threshold and the
  brief's own objective/constraint ids, so changing difficulty returned a stale
  verdict whose constraint ids no longer matched — a genuine pass reported as a
  fail. The key now includes all of them.

**Persistence**
- `storageWrite` swallowed quota errors, so a failed save looked successful and
  the list showed stale data. It now returns a boolean and the shell raises a
  warning toast when a save does not persist.
- `makePlanId` and the scenario-copy id had millisecond resolution, so two ids
  made in the same millisecond collided (a save overwrote its twin; a copy
  pushed a duplicate). Both now append a session counter.
- Loading a saved plan ignored its stored objectives/constraints and re-derived
  them from the current difficulty. A plan now stores its difficulty and
  restores it on load.

**Interface**
- Space is the activation key for a focused control, but the global handler
  cancelled it, so Space on any focused button toggled the day instead of
  pressing the button (and on the minimap it did both). Space is now ignored
  when the event target is a control.
- The command palette claimed `aria-modal` with no focus trap, so Tab walked the
  toolbar behind the scrim. Tab is now held inside the palette.

**Analytics**
- `circleOverlapFraction` fed `acos` a value that near tangency could round
  outside `[-1, 1]` and leak `NaN` into catchment population. Clamped.
- `capacityLostFor` rounded the road-km total after every edge, so the reported
  loss depended on edge order. Summed then rounded once.
- `systemTheme` would throw where `matchMedia` is absent. Guarded.

### Deferred (low, no live trigger or a product call)

- Bridge criticality share divides road-path use by a transit-pair count
  (`resilience.ts:212`), so it can exceed 100 and is silently clamped; the fix
  needs the road OD-pair count.
- The growth-layout water check samples 0.8× the half-diagonal at three points
  (`layout.ts:238`); a rotated corner could sit over water. Could not
  demonstrate a failing seed.
- `tutorialSteps` mutates a ref during render (`App.tsx:405`); harmless and
  idempotent under StrictMode.
- Editing while the map shows Baseline records an op but does not apply it until
  you switch to Scenario (`App.tsx:1407`).
- Saved scenarios and plans are never pruned, so storage grows without bound.

## Verification

- `npm run lint`, `npm run test` (224), `npm run build` green.
- Golden hashes unchanged — proof that no undisrupted-day result moved.
- Browser: console clean, theme switch keeps the camera pose, selection
  emphasis clears when deselected.
