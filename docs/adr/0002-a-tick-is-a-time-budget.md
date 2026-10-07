# A tick is a time budget; every stop pays its own dwell

## Status

Accepted. Changes simulation results.

## Context

Each one-minute tick moved a vehicle its full distance, served every station it
crossed, then applied a single dwell. On the compact map a metro covers about
530 m a tick and stations are 90 to 150 m apart, so it crossed several stations
and paid for one stop. Fleet sizing (`cycleMin`) assumes a stop at every station,
so the fleet was sized for a slower line than the one that ran. Terminus
turnaround (a setting in the service plan) was used only for sizing, never in
movement. B1 was a "loop" with no closing leg, so its vehicles jumped from the
last stop to the first. People who reached a platform while a vehicle was
dwelling there could not board, because boarding happened only at arrival.

## Decision

`advancePassengers` spends each tick as a time budget per vehicle (`driveVehicle`
in `passengers.ts`): run to the next station, serve it (alight, then board),
dwell, and carry on with what is left. Dwell that does not fit carries to the next
tick. A vehicle never skips a station.

- Each stop pays its own dwell (base plus boardings and alightings).
- A terminus serves once, takes the plan's turnaround, then sends the vehicle back.
  Reliability draws stay one per terminus visit.
- A vehicle standing at a platform keeps boarding people who arrive; each costs
  its per-boarding time.
- A held or parked vehicle behaves as before; a closed hop ahead stops a vehicle
  mid-tick.
- `LOOP_ROUTES` is empty: every line runs out and back, as drawn. B1 is out and
  back. The loop code in sizing and boarding stays, unused, for a loop with a real
  closing leg.

## Consequences

- Vehicles cover their line no faster than `cycleMin` allows (a test holds this),
  so the fleet the plan asks for is the fleet that is needed.
- Waits and boardings shift: cycles are longer, headways are what the plan says.
  Run-length tests that passed on luck of timing were not changed.
- B1 now runs out and back, so its sizing doubles to match.
- The display schedule (ADR 0001) stays: the map is still compact.
