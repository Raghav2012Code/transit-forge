# Changelog

Newest first. Version is read from `src/version.ts`.

## 1.5.0

- **World scale.** The city is now real-scale: one `WORLD_SCALE` constant
  (`src/simulation/city/geography.ts`) multiplies every position by 5, so the
  city spans about 6 km east-west by 4.2 km north-south. Metro lines run 2.6-2.8 km (about six
  minutes one way), suburban rail 6.4 km and buses 1.7-4.1 km; the airport runway
  is 1090 m and the harbour piers 390 m. What deliberately did not scale: speeds,
  headways, dwells, street widths and building envelopes. Every trip is longer in
  real minutes, so travel-time and throughput figures move; the golden day was
  re-recorded and a fleet-sanity test pins that no route is truncated by the
  vehicle caps at this scale. Visual regression checked in both themes: the
  compact-map captures (`docs/media/map-light.webp`, `map-dark.webp`) beside the
  scaled ones (`docs/media/worldscale-light.png`, `worldscale-dark.png`).

## 1.4.0

- **Time machine.** Click the past on the day strip and the day is rebuilt from
  07:00 by replay, in chunks across frames with a progress indicator. "Fork the
  day here" freezes the interventions so far; the changes made after it run as a
  second branch. Both branches run headless in a worker, and the result is the
  usual comparison table plus two series on the charts. Service and fare edits
  can carry the minute they happen (`atMin`), so a live edit, a replayed one and
  a headless one land in the same step. Disruptions added by hand are remembered
  so a rebuilt day keeps them, and ending an active incident early leaves it at
  least five minutes long.
- **Journey inspector.** Each trip records why it was taken: the options that
  existed, the transit and road estimates, the fare and the chance of driving.
  Finished trips go into a ring of the last 200. Select a vehicle to see its
  riders, a station to see who is waiting, or open Recent trips, then open a
  trip card that explains the trip in plain statements. Stranded and
  denied-boarding trips are marked as conditions.
- **Failure handling.** A plain message with the error text, a reload button and
  a "Reset saved data" button replaces a blank page when the app crashes; a
  separate message says so when WebGL is unavailable.
- **Accessibility pass.** Viewport role, one page heading and heading order
  fixed, found by an axe scan run once by hand.
- **Correct vehicle movement.** A tick is a time budget: a vehicle stops at every
  station and pays that stop's dwell (`docs/adr/0002`). Lines run out and back,
  as drawn. Station placement rules match the map. This changes simulation
  results.
- **Redesigned city, lines and trains**, and a workbench layout: top bar, mode
  rail, day bar, side panel built around the selection, a reports sheet, a
  command palette, and a switchable light and dark theme (`DESIGN.md`).
- **CI.** Lint, test and build run on every push to `main` and on pull requests.

## 1.3.0

- Interactive planning map.

## Earlier

The version-by-version history below was moved here from the README, as it was written.

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

