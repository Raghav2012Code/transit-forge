# Vehicles are drawn on the line's schedule, not at the simulation's step positions

## Status

Accepted.

## Context

The simulation advances in one-minute steps and moves vehicles at real speeds
(a metro at 32 km/h covers 530 m a minute) over a map about a kilometre across.
A metro line is 520 m long, so one step carries a vehicle most of the way down
its line and the next step carries it back. Drawn at the simulation's positions
a train is a flicker, and the first stop it reaches is whichever one the step
happened to land on.

Changing the step, or the speeds, would change every result in the simulation
(boardings, waits, transit share, the analytics built on them). The speeds and
the map's scale are consistent with each other in time; only the picture is not.

## Decision

The renderer replays each line's service instead of following `VehicleState.s`.
The simulation still decides how many vehicles a line has and how often it runs
(fleet and peak headway). Their product is the cycle. Within the cycle every
vehicle follows one schedule: hold at the platform, ease out, run, ease in, hold,
turn at the ends. Vehicles are spread evenly around the cycle, so their spacing
is the headway. A visual clock that glides between whole-minute steps drives it.

Only position is replayed. Load, riders, boardings and every reported number
still come from the simulation.

## Consequences

- Motion is smooth and legible at any run speed and frame rate, and trains stop
  at stations. The replay itself changes no reported number, but it landed
  alongside movement-model changes that did move results (terminus turnaround,
  per-stop dwell, late-boarding dwell, B1 no longer looping): the golden
  hashes were re-recorded for the new results.
- A vehicle's drawn position is not where the simulation has it. Nothing in the
  interface reads the drawn position back, so nothing disagrees; if something
  ever needs "where is this vehicle now", it should ask the schedule.
- If the simulation ever moves to a finer step with map-scale speeds, this can
  be removed and vehicles drawn at `s` through `TrackCurve.arcAtSim`, which is
  kept for that.
