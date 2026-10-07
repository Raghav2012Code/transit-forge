import { describe, expect, it } from 'vitest';
import { buildSchedule, DWELL_MIN, VisualClock } from './schedule.ts';

const knots = [0, 130, 270, 400, 520];

describe('line schedule', () => {
  const cycle = 15;
  const sch = buildSchedule(knots, cycle);

  it('repeats exactly once per cycle, which is fleet x headway', () => {
    expect(sch.cycle).toBeCloseTo(cycle, 6);
    for (const t of [0.3, 2.2, 7.9]) {
      expect(sch.at(t).arc).toBeCloseTo(sch.at(t + sch.cycle).arc, 6);
    }
  });

  it('holds still on every platform for the dwell time', () => {
    for (const k of knots) {
      // Find a clock where the vehicle is at knot k, then check it stays put.
      let found = -1;
      for (let t = 0; t < sch.cycle; t += 0.01) {
        if (Math.abs(sch.at(t).arc - k) < 1e-9) {
          found = t;
          break;
        }
      }
      expect(found).toBeGreaterThanOrEqual(0);
      expect(sch.at(found + DWELL_MIN * 0.5).arc).toBeCloseTo(k, 6);
    }
  });

  it('never leaves the line and never reverses mid-run', () => {
    let last = sch.at(0).arc;
    let dir = 0;
    for (let t = 0.01; t < sch.cycle; t += 0.01) {
      const { arc } = sch.at(t);
      expect(arc).toBeGreaterThanOrEqual(0);
      expect(arc).toBeLessThanOrEqual(520);
      const d = Math.sign(arc - last);
      if (d !== 0) {
        if (dir !== 0 && d !== dir) {
          // A reversal is only allowed at a terminus.
          expect([0, 520].some((e) => Math.abs(last - e) < 1)).toBe(true);
        }
        dir = d;
      }
      last = arc;
    }
  });

  it('speeds up and slows down smoothly, never faster than twice the average pace', () => {
    const pace = (2 * 520) / (sch.cycle - 8 * DWELL_MIN);
    let prev = sch.at(0).arc;
    for (let t = 0.005; t < sch.cycle; t += 0.005) {
      const arc = sch.at(t).arc;
      expect(Math.abs(arc - prev) / 0.005).toBeLessThan(pace * 2);
      prev = arc;
    }
  });

  it('survives a cycle too short for its dwell time', () => {
    const tight = buildSchedule(knots, 2);
    expect(Number.isFinite(tight.cycle)).toBe(true);
    expect(Number.isFinite(tight.at(0.7).arc)).toBe(true);
  });
});

describe('visual clock', () => {
  it('glides between whole-minute steps and stops when the run is paused', () => {
    const c = new VisualClock();
    expect(c.read(420, 0)).toBe(420);
    c.read(421, 0.5); // learns 2 clock minutes per second
    const mid = c.read(421, 0.75);
    expect(mid).toBeGreaterThan(421);
    expect(mid).toBeLessThan(422);
    // Paused: no new step arrives, so it never runs more than one step ahead.
    expect(c.read(421, 30)).toBeLessThanOrEqual(422);
  });

  it('starts over when the day is reset', () => {
    const c = new VisualClock();
    c.read(500, 0);
    c.read(501, 0.5);
    expect(c.read(420, 1)).toBe(420);
  });
});
