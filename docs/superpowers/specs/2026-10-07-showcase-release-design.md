# Showcase release

## Goal

Turn TransitForge into a portfolio piece a stranger can open from a link, understand
in under a minute, and trust on inspection. The audience is a recruiter or engineer
judging a full-stack generalist: UI craft, 3D rendering, and simulation engineering
each have to show, and none of them may look unfinished.

Beyond the release work, three features give the project something no other transit
sandbox has and make the engineering visible: a **journey inspector** that explains why
a trip happened, a **time machine** that rewinds and forks the day, and **Beat the
Planner**, an automated planner the player competes against. All three are built on what
the simulation already guarantees: determinism and a headless evaluator.

No change to the map's scale. The scale pass, city life (piece 2) and shareable plan
links stay out (see Out of scope).

## Done means

A reviewer who has never seen the project, on a clean browser profile:

1. Opens a public URL and sees the map running within a few seconds, with no console errors.
2. Sees trains moving on the default network immediately, with nothing to dismiss first.
3. Finds the same experience in light and dark and at 390 px wide, with no horizontal scroll.
4. Reads the README top to bottom and learns what it is, why it is interesting, how it is built, and where the decisions are recorded, without opening the code.
5. Sees a green CI badge, and `npm run lint`, `npm run test` and `npm run build` are clean.
6. Can open any trip and read why it happened, scrub the day back and fork it to compare two interventions, and run the planner duel, all on the deployed build.

Each of these is checked by hand or by the smoke test before the work is called done.

## Milestones

One commit each, in this order. A milestone lands only when lint, test and build are
clean (`AGENTS.md`). Work lands on the fork's `main` through a pull request.

### 1. Land the open branch and make the README true

- Open a pull request from `feature/sim-correctness` to the fork's `main` and merge it. The open PR to the parent (`feature/city-redesign` work) is separate and not touched here.
- The README status section stops at v1.2 and its "Known limitations" no longer match the code (vehicles now stop at stations; ADR 0002). Correct both against the code. Version is read from `src/version.ts`; the README does not hard-code a test count.

Accepted when: `main` contains the correctness work and no README sentence contradicts the code.

### 2. CI and a live deployment

- `.github/workflows/ci.yml`: on push and pull request, Node 22, `npm ci`, `npm run lint`, `npm run test`, `npm run build`.
- Deploy to Vercel as a static Vite site from the fork's `main`, base path `/`, no server code. Preview deployments on pull requests come with the integration.
- A status badge and the live link go at the top of the README (written in milestone 8; the badge URL is known after this milestone).

Accepted when: a push to `main` builds in CI and the live URL serves that commit, loaded cold with an empty cache.

Risk: the repo's Vercel project needs the owner's account. The Vercel connector in this environment needs authentication; if it is not available, the owner connects the repo in the Vercel dashboard (a two-minute step) and the rest is unchanged.

### 3. Failure handling

No tour and no new onboarding UI. The existing "First run" checklist in the Plan panel stays as it is.

- **Error boundary.** A top-level boundary around the app. On a render error it shows a plain message, the error text, a reload button, and a "Reset saved data" button that clears this app's `localStorage` keys, since corrupt saved state is the likeliest cause of a crash on a returning visit.
- **No WebGL.** If the renderer cannot start, the same fallback says so in words instead of a blank canvas. A recruiter on a locked-down machine must not see an empty page.

The fallback uses tokens only and is theme-blind (`DESIGN.md`).

Accepted when: forcing a render error shows the fallback; disabling WebGL shows the message; corrupt saved data can be reset from the fallback.

### 4. Quality pass and a smoke test

- **Responsive and themes.** Walk every mode (simulate, build, disrupt, plan) and every sheet in both themes at 1440 px, 768 px and 390 px. Fix overflow, clipped controls and unreadable states found.
- **Accessibility.** Keyboard reach and visible focus for every control; accessible names on icon buttons; contrast in both themes against the tokens; dialog semantics on sheets. Checked with an automated scan plus manual keyboard passes.
- **Performance.** Record the cold-load size and time-to-first-frame on the deployed build, and a frame-time sample during a running day. Write the numbers in the README only if measured; fix only what is clearly bad.
- **Smoke test.** One Playwright test, run as `npm run e2e` and as its own CI job so a browser flake never blocks `npm run test`. It loads the built app (software WebGL in headless Chromium), asserts the canvas renders, no console errors, play advances the clock, `T` switches theme, and at 390 px the page does not scroll horizontally. New dev dependencies: `@playwright/test` and `@axe-core/playwright`, for this purpose only.

Accepted when: the smoke test passes locally and in CI, the axe scan reports no serious or critical issues, and a manual keyboard-only run reaches every mode.

Risk: headless WebGL can be flaky. If software rendering proves unstable in CI, keep the test local and documented rather than letting it become a red badge.

### 5. Journey inspector

Today the simulation can say how many trips completed, never why one trip went the way it
did. A passenger holds legs and counters but not the decision behind them, and arrived
passengers are dropped from `passengers` each tick (`passengers.ts`).

- **Record the decision at spawn.** Each passenger and car trip gets a small `decision`: which options existed (transit and road, transit only, road only), the transit estimate in minutes, transfers, the road estimate, the fare, and the car probability from `carProbability`. It is the same call the sim already makes, repeated once at spawn. No random draw is added or reordered, so results do not move.
- **Keep a short memory of finished trips.** On arrival, append a compact trip record (decision, legs, wait, ride, transfers, fare, how it ended) to a bounded ring of the last 200 on the sim state. It is written once per trip, never per frame, which keeps to the analytics rule in `AGENTS.md`.
- **Pure explanation.** `explainTrip(record)` in the simulation layer returns a typed list of statements ("Chose transit: 24 min with 1 transfer against 31 min by car; 38% chance of driving", "Waited 9 min at Central, 4 of them for a train that left full"). The UI formats it and holds no logic.
- **Entry points.** Select a vehicle to list its riders (`VehicleState.riders`), select a station to list who is waiting there, and open a Recent trips list from the inspector. Clicking a row opens a trip card in the side panel. Stranded and denied-boarding trips are the most useful cases and are marked as conditions.
- **Interface rules.** Route bullets reuse `RouteBullet`; colour keeps meaning only a line or a condition; the open trip is shown by ink.

Tests: a golden `SimStats` hash for seed 1337 is unchanged; every trip created in a day has a decision; the ring never exceeds 200 and keeps the newest; `explainTrip` on hand-built records gives the expected statements, including the transit-only, road-only and stranded cases.

Accepted when: with the sim running, selecting a vehicle, opening a rider and reading the card takes three clicks; a stranded trip explains itself; the golden hash matches.

### 6. Time machine

Live service and fare edits already apply to the running day (`onServicePatch` and
`onFarePolicy` in `App.tsx`), but they log no time, and the logic lives in a component,
against the layering rule. The simulation is deterministic, so any minute of the day can
be rebuilt exactly.

- **Move the live-edit logic into the simulation layer.** `applyServicePatch` and `applyFares`, with the fleet reconciliation, come out of `App.tsx` unchanged in behaviour. `App.tsx` calls them. The golden hash proves nothing moved.
- **Timed interventions.** `setService`, `setFares` and `scheduleIncident` ops take an optional `atMin` (minute of day). Absent means start of day, which is what every saved scenario does today, so saved data loads unchanged.
- **Headless runs honour timing.** `runHeadlessDetailed` and the compare functions apply a timed op at its tick through the same two functions, so a branch's numbers equal what the live sim shows.
- **Scrub.** Dragging the day strip back to minute M rebuilds the day from 07:00 by replay. A full replay costs roughly 1.2 ms per tick early in the day (a 360-tick run measures about 0.45 s here), and later ticks cost more as passengers accumulate; the spike measures the whole day. Replay runs on the main thread in chunks across frames with a progress indicator. Checkpoints (`structuredClone` of the state every 60 ticks) are added only if replay proves too slow, and must produce deep-equal states.
- **Fork.** "Fork here" at minute M freezes the current timed interventions as branch A. The player makes new interventions (a headway change, a fare change, an incident) recorded at M as branch B. Both branches run headless in a worker; the result is the existing compare rows plus two series on the charts.
- **Scope.** Structural edits stay whole-day (see Out of scope).

Tests: scrubbing to minute M gives a state deep-equal to stepping straight to M; a branch is identical to the original before its fork minute; headless branch stats equal live-stepped branch stats; an old scenario with no `atMin` produces the same results as before.

Accepted when: from 10:30 you can rewind to 08:00, make one change, fork, and read a branch comparison whose numbers match the live day.

Risk: replay is exact but not instant. If chunked replay feels slow, checkpoints are the answer, and the equality test guards them.

### 7. Beat the Planner

An automated planner takes the same brief, constraints and operations the player has, and
produces a plan. Both plans go through the same `evaluatePlan`, so the result is a fair
duel on this city and seed. The copy in the UI says so, and does not claim the planner's
plan is best in general.

Measured here with seed 1337 (Node, Vitest): one 360-tick headless run takes about 0.45 s;
`evaluatePlan` takes about 0.9 s at horizon 0 and 1.85 s at horizon 5, because it re-runs
the baseline on every call.

- **Cached baseline.** `evaluatePlan` accepts an optional precomputed baseline, roughly halving the cost of each candidate. A test shows output is identical with and without it.
- **Pure planner in the simulation layer** (`src/simulation/planner/`). A candidate generator produces `EditOp`s from the current network, seeded by the existing rule-based `recommendFor` results and extended with headway, fleet and capacity steps per route, `extendRoute`, bus `addRoute` between uncovered high-demand zones, and `addStation` where `validateStationPlacement` allows it. Search is deterministic: candidates are ordered by id, ties broken by a fixed rule, no `Math.random()`. It runs a beam search of width 3 over op sequences, scoring in order: constraints satisfied, objectives passed, summed objective margin, `planningScore`, lower cost.
- **Stops on an evaluation cap, not on the clock.** The same brief and cap always produce the same plan. A wall-clock limit exists only as a safety net.
- **Worker pool** (`src/workers/`, named in `AGENTS.md` but not yet present): min(4, hardwareConcurrency − 1) workers, each holding its own copy of the base city and network. Messages carry candidate ops in and a small result summary out, with progress and cancel. At about 0.5 s per evaluation and four workers, 30 s is roughly 240 evaluations.
- **UI.** In Plan mode, with a brief selected: "Challenge the planner". The player builds a plan as usual, then runs the planner (progress shows evaluations used and best score so far). A duel card shows both plans: objectives passed, construction cost against budget, score, and the list of interventions. "Load planner's plan" opens it as a scenario on the map. The winner is marked by ink, not colour.

**Spike first, with a go/no-go rule.** Before any UI, run the planner headless against all
seven briefs at easy and medium difficulty. Go for the full duel if it meets every objective
on at least half the easy briefs within 240 evaluations. Otherwise ship the smaller
**advisor**: one best next move per click, ranked by its evaluated gain, on the same
pipeline. The spike reports pass counts and evaluations used, whichever way it goes.

Tests: same brief and cap give the same plan and score; the cached baseline matches the uncached result; every planner op passes the same validation as a player op; a plan the planner returns, replayed through `evaluatePlan`, reproduces the score it reported.

Accepted when: on a brief the spike marks as go, a player can finish a plan, run the planner, see a duel card, and load the planner's plan on the map, with the UI responsive throughout.

Risk: the planner overfits the single seed, and a hill-climb can stall in a local optimum. Both are named in the copy and the write-up rather than hidden, and the spike's numbers decide scope.

### 8. README, assets, licence and write-up

- **README.** A new top: one-line pitch, live link, badge, a hero GIF of a day running, then side-by-side light and dark screenshots. A short section per feature (trip card, fork comparison, planner duel) with its own capture, taken from the deployed build. Then: what it does, the three-layer architecture as a diagram (Mermaid, rendered by GitHub), how determinism is kept (seed 1337, no `Math.random()` in `src/simulation/`), a short "decisions worth reading" list linking the ADRs and `DESIGN.md`, run and test instructions, and credits.
- **History.** The long version-by-version status text moves to `CHANGELOG.md`, so the README stays a front page.
- **Assets.** Captured from the deployed build with Playwright, committed under `docs/media/`, kept small (compressed GIF, WebP or optimised PNG). A repo social preview image.
- **Licence.** Needs an owner decision (see Open decisions). No licence file is added until it is settled.
- **Write-up.** A short engineering note in `docs/` on the tick-as-time-budget decision, the display-schedule decision, and the layering rule, linked from the README. Built from the two ADRs, not new claims.

Accepted when: the README renders correctly on GitHub in light and dark, every link and image resolves, and the hero GIF shows what the live site actually does.

## Open decisions (owner)

- **Licence and authorship.** 17 of the project's commits are by another author, and `upstream` (`Raghav2012Code/transit-forge`) is the parent. A licence is theirs to grant for their work. Options: ask them to agree to MIT with both names, or leave the repo unlicensed and say so ("all rights reserved") until they answer. Do not publish a licence file on assumption.
- **Host.** Vercel by default. GitHub Pages works but needs a base path and a deploy workflow.
- **Planner ambition.** The planner spike (milestone 7) decides between the full duel and the smaller "advisor" fallback. The go/no-go rule is written there so it is not improvised later.
- **Custom domain.** Optional; a `*.vercel.app` URL is acceptable for the first release.

## Out of scope, named

- `src/App.tsx` is over 2,600 lines. A reader opening it will notice. Splitting it is a real improvement for the engineering story but is a refactor with regression risk; it is the first candidate for the next milestone, not part of this one.
- Scale pass and city life (piece 2): changes every simulation baseline.
- Shareable plan links, daily briefs, replay export: approach 2 from the brainstorm, after this release.
- Moving the live simulation off the main thread. Workers are used only for headless runs (the planner and branch comparison), whose results are small.
- Structural edits (stations, routes, roads) as timed interventions in the time machine. They stay whole-day, made in Build mode.
- Passenger meshes or picking in the 3D scene. Trips are reached through vehicles, stations and a recent-trips list.

## Tests

- Existing vitest suites stay green; this work adds no simulation logic.
- A unit test for the error boundary's reset action, in the style of `commands.test.ts`.
- The Playwright smoke test above, extended in milestones 5 to 7 with one cheap assertion each (a trip card opens, scrubbing changes the clock, the planner panel opens).
- Milestones 5 to 7 add the tests listed in each milestone. Every one that touches the simulation first records a golden `SimStats` hash for seed 1337 from the unmodified code, and the change must reproduce it exactly unless the milestone says results move and why.
- Browser check in both themes and at 390 px for every UI milestone.
