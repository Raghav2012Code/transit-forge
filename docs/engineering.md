# Three decisions worth reading

TransitForge is a sandbox where a network edit has to change simulation results,
and where the numbers on screen have to be believable. Three decisions follow
from that. Each is recorded in more detail in an ADR or in `AGENTS.md`.

One constant is the ruler for the whole world: `WORLD_SCALE` in
`src/simulation/city/geography.ts` multiplies every position — city bounds, coast,
river, zones, roads, stations — by the same factor. Speeds, headways, dwells,
street widths and building envelopes are intentionally not scaled, so enlarging
the world lengthens trips in real minutes without enlarging the things that stand
in it. Bumping the constant rescales the world; the pieces that are not derived
from it (the shadow frustum's reach, the camera's near/far ratio) are tuned
alongside it, so a scale pass also means rechecking those few.

## A tick is a time budget

One simulation step is one minute. A metro covers about 530 m in a minute, and at
real scale (`WORLD_SCALE = 5`) stations are 450 to 750 m apart, so a step reaches
roughly one station. The first version of the step moved a vehicle its full
distance, served every station it crossed and applied a single dwell. A line was
sized as if it stopped everywhere, but ran as if it stopped once.

[ADR 0002](adr/0002-a-tick-is-a-time-budget.md) changes the step to spend the
minute as a budget per vehicle: run to the next station, serve it, pay its dwell,
carry on with what is left. Dwell that does not fit carries into the next tick. A
vehicle never skips a station, so the fleet a plan asks for is the fleet the line
needs. The decision changed results, and the ADR says so. The cost was that waits
and boardings shifted. The gain was that a number such as average wait can be
traced to vehicles that really stopped where people were standing.

## The picture follows a schedule, the numbers follow the simulation

Drawn at the simulation's own positions, a train that jumps 530 m — a fifth of a
2.6 km metro line — in a step is a flicker. Changing the step or the speeds would
change every result.
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

The journey inspector rests on the same idea: it records the decision a trip made at
the moment it was made, and adds no random draw to do it.
