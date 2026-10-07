/**
 * What a vehicle does on its line, as a function of the clock.
 *
 * The simulation moves vehicles in one-minute steps at real speeds across a
 * compact map, so a metro covers most of its line in a single step. Drawn
 * as-is that is a flicker, not a train. The renderer instead replays each
 * line's service: the simulation's own fleet size and headway fix the cycle
 * (so spacing between vehicles is exactly the headway), and within that cycle
 * the vehicle accelerates, runs, brakes, and holds at every platform.
 */
export interface Schedule {
  /** Minutes for one full out-and-back cycle. */
  cycle: number;
  /** Where a vehicle that is `minutes` into its cycle is, and which way it faces. */
  at: (minutes: number) => { arc: number; dir: 1 | -1 };
}

interface Leg {
  t0: number;
  t1: number;
  a0: number;
  a1: number;
}

const smooth = (x: number): number => x * x * (3 - 2 * x);

/** Visual dwell at a platform, in clock minutes. */
export const DWELL_MIN = 0.45;

/**
 * `knots` are the stations' arc lengths along the drawn curve. `cycle` is the
 * out-and-back time the fleet and headway imply (fleet x headway).
 */
export function buildSchedule(knots: number[], cycle: number): Schedule {
  const n = knots.length;
  if (n < 2 || !(cycle > 0)) return { cycle: 1, at: () => ({ arc: knots[0] ?? 0, dir: 1 }) };
  const run = knots[n - 1] - knots[0];
  const stops = 2 * n - 2;
  // Never let platform time eat the whole cycle on a short or crowded line.
  const dwell = Math.min(DWELL_MIN, (0.5 * cycle) / stops);
  const moving = Math.max(cycle - stops * dwell, cycle * 0.4);
  const pace = (2 * run) / moving; // metres per clock minute, averaged over the run

  const legs: Leg[] = [];
  let t = 0;
  const hold = (arc: number) => {
    legs.push({ t0: t, t1: t + dwell, a0: arc, a1: arc });
    t += dwell;
  };
  const travel = (a: number, b: number) => {
    const d = Math.abs(b - a) / pace;
    legs.push({ t0: t, t1: t + d, a0: a, a1: b });
    t += d;
  };
  for (let i = 0; i < n - 1; i++) {
    hold(knots[i]);
    travel(knots[i], knots[i + 1]);
  }
  for (let i = n - 1; i > 0; i--) {
    hold(knots[i]);
    travel(knots[i], knots[i - 1]);
  }
  const total = t;

  return {
    cycle: total,
    at(minutes) {
      const m = ((minutes % total) + total) % total;
      let lo = 0;
      let hi = legs.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (legs[mid].t0 <= m) lo = mid;
        else hi = mid - 1;
      }
      const leg = legs[lo];
      if (leg.a0 === leg.a1) {
        // At a platform: face the way the next leg runs.
        const next = legs[(lo + 1) % legs.length];
        return { arc: leg.a0, dir: next.a1 >= next.a0 ? 1 : -1 };
      }
      const f = (m - leg.t0) / Math.max(1e-9, leg.t1 - leg.t0);
      return { arc: leg.a0 + (leg.a1 - leg.a0) * smooth(Math.min(1, f)), dir: leg.a1 >= leg.a0 ? 1 : -1 };
    },
  };
}

/**
 * A clock that runs smoothly between the simulation's whole-minute steps.
 * It learns how fast the simulation is running from the steps it sees, and
 * never runs more than one step ahead, so it stops when the run is paused.
 */
export class VisualClock {
  private simMin = Number.NaN;
  private wallAtStep = 0;
  private rate = 0; // clock minutes per wall second
  private step = 1; // clock minutes in the latest step

  read(simMin: number, wallSeconds: number): number {
    if (!Number.isFinite(this.simMin) || simMin < this.simMin || simMin - this.simMin > 90) {
      // First look, or the day was reset or jumped: start over from here.
      this.simMin = simMin;
      this.wallAtStep = wallSeconds;
      this.rate = 0;
      this.step = 1;
      return simMin;
    }
    if (simMin > this.simMin) {
      const wall = wallSeconds - this.wallAtStep;
      if (wall > 1e-3) {
        const seen = (simMin - this.simMin) / wall;
        this.rate = this.rate === 0 ? seen : this.rate * 0.6 + seen * 0.4;
      }
      this.step = Math.max(1, simMin - this.simMin);
      this.simMin = simMin;
      this.wallAtStep = wallSeconds;
    }
    const lead = Math.min(this.step, Math.max(0, (wallSeconds - this.wallAtStep) * this.rate));
    return this.simMin + lead;
  }
}
