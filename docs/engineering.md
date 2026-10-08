# Three decisions worth reading

TransitForge is a sandbox where a network edit has to change simulation results,
and where the numbers on screen have to be believable. Three decisions follow
from that. Each is recorded in more detail in an ADR or in `AGENTS.md`.

## A tick is a time budget

One simulation step is one minute. On this map a metro covers about 530 m in a
minute and stations are 90 to 150 m apart, so the first version of the step moved
a vehicle its full distance, served every station it crossed and applied a single
dwell. A line was sized as if it stopped everywhere, but ran as if it stopped
once.

[ADR 0002](adr/0002-a-tick-is-a-time-budget.md) changes the step to spend the
minute as a budget per vehicle: run to the next station, serve it, pay its dwell,
carry on with what is left. Dwell that does not fit carries into the next tick. A
vehicle never skips a station, so the fleet a plan asks for is the fleet the line
needs. The decision changed results, and the ADR says so. The cost was that waits
and boardings shifted. The gain was that a number such as average wait can be
traced to vehicles that really stopped where people were standing.

## The picture follows a schedule, the numbers follow the simulation

Drawn at the simulation's own positions, a train that covers most of a 520 m line
in a step is a flicker. Changing the step or the speeds would change every result.
[ADR 0001](adr/0001-vehicles-follow-a-display-schedule.md) keeps the simulation
as it is and has the renderer replay each line's service: hold at the platform,
ease out, run, ease in, hold, turn at the ends. Only position is replayed. Load,
riders, boardings and every reported figure still come from the simulation, and
nothing in the interface reads a drawn position back, so nothing can disagree.
The price is that a vehicle's drawn position is not where the simulation has it.

## Three layers, and a simulation that can be replayed

The code is split in three (`AGENTS.md`):

- `src/simulation/` is pure TypeScript with no React or Three.js. It owns the
  city, routing, ticks, loads and statistics.
- `src/rendering/` draws that state with Three.js and holds no simulation logic.
- `src/ui/` is the React interface and only calls the simulation's API.

The simulation is deterministic: seed 1337, no `Math.random()` in
`src/simulation/`, and a golden test that pins the statistics of a day. A change
that moves results has to explain why, as ADR 0002 does.

That discipline is what makes the time machine possible. Because the same seed
and the same edits give the same day, any minute can be rebuilt by replay, and a
fork can run both of its branches headless in a web worker. A live edit, a
replayed edit and a headless edit all pass through one function at the first step
where the clock reaches the edit's minute, so they agree by construction. The
journey inspector rests on the same idea: it records the decision a trip made at
the moment it was made, and adds no random draw to do it.
