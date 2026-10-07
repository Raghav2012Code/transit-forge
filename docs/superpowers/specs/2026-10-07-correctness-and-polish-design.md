# Correctness and polish

## Goal

Make vehicles in the simulation behave like vehicles, keep the build tools in
agreement with the drawn map, and cut the bundle. No change to the map's scale.

## 1. Simulation: a tick is a time budget

Today a vehicle moves its full tick distance, serves every station it crossed,
then takes one dwell. A metro at 32 km/h covers about 530 m a tick and stations
are 90 to 150 m apart, so it crosses several stations and pays for one stop.
Fleet sizing (`cycleMin`) assumes a stop at every station, so fleet and motion
disagree.

New rule in `advancePassengers`: each moving vehicle has `dtMin` of time to
spend. It runs to the next station ahead, spending distance / speed. If it
arrives within budget it serves the station (alight, then board), takes that
stop's dwell out of the remaining budget, and carries on. Whatever dwell does
not fit in the tick stays in `dwellLeft`. A vehicle never skips a station.

Kept as is: held and parked vehicles, the closure checks (`hopAheadBlocked`),
stop delay incidents, reliability draws and cancellations (at terminus
turnarounds only), reflection at the ends of ping-pong routes, `vehKm` and
`vehHr` counters. A turnaround still serves the terminus once.

Loop routes (`LOOP_ROUTES`, only `rt-b1`): the loop length gains a closing leg
from the last station back to the first. `routeLengths` and `routeCumDist` for
a loop get one extra entry; connections are unchanged (routing never rides the
closing leg). Vehicles on the closing leg carry riders as usual and serve the
first station on arrival.

Determinism: still seed 1337, no `Math.random()`. Results shift because dwell
now applies at every stop; this is the point and is recorded in ADR 0002.

## 2. Placement checks match the drawn map

`validateStationPlacement` and `validateRoadNode` use fixed numbers (water for
x < -300, river within 30 m of x = 120, bounds |x| 600 and |z| 420). The map
draws a wavy coast (about -322 plus or minus 15) and a 13 m half-width river.
They read the city's own `coast` and `river` instead, with the drawn
half-width plus a small margin, and share the bounds with the plate. The
`gaps.ts` constants (`WATER_X`, `RIVER_X`, `RIVER_HALF`) read the same data.

## 3. Build and disrupt visuals on the new alignment

The replacement-shuttle line is a straight line at y 9. It is drawn as a band on
the shuttle's own alignment at the mode's running height. Markers and rings use
`MODE_Y` rather than literal heights.

## 4. Bundle

Lazy-load the Reports sheet. Split `three` into its own chunk through
`manualChunks`. Goal: no chunk over 500 kB, or the remaining one named and
explained.

## Tests

- Vehicle crossing three stations in a tick serves all three, each with its own
  dwell, and a 1-minute tick never advances time past budget.
- A vehicle whose dwell exceeds the tick carries the rest to the next tick.
- Loop route: length equals chain plus closing leg; a vehicle completes a lap and
  serves station 0 without a position jump larger than one tick of travel.
- Placement: points on the drawn coast and river are rejected, points just inland
  are accepted.
- Existing suites stay green; run-length thresholds are updated only where the
  new, slower cycle makes the old number wrong, with the reason noted.
- Lint, test and build clean; browser check in both themes and at 390 px.

## Out of scope

Scale pass, the display schedule (it stays), city life (piece 2).
