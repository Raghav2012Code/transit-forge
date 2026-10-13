import { describe, expect, it } from 'vitest';
import type { SeriesPoint } from '../../simulation/analytics/series.ts';
import {
  DAY_FROM,
  DAY_TO,
  dayStartOf,
  incidentSpans,
  minuteAt,
  minuteOfDay,
  nudgePending,
  nudgeRewind,
  nudgeTarget,
  peakBands,
  rewindTargetFor,
  runTargetFor,
  tracePoints,
  xOf,
} from './dayStrip.ts';

const point = (t: number, waiting: number, onboard: number): SeriesPoint => ({
  t, generated: 0, completed: 0, roadGen: 0, roadDone: 0, active: 0, waiting, onboard,
  cars: 0, avgTravel: 0, avgWait: 0, totalTravel: 0, totalWait: 0,
});

describe('day strip geometry', () => {
  it('maps the operating day onto the full width and back', () => {
    expect(xOf(DAY_FROM, 200)).toBe(0);
    expect(xOf(DAY_TO, 200)).toBe(200);
    expect(xOf(840, 200)).toBeCloseTo(100, 5);
    expect(minuteAt(0, 200)).toBe(DAY_FROM);
    expect(minuteAt(200, 200)).toBe(DAY_TO);
    expect(minuteAt(100, 200)).toBe(840);
  });

  it('pins minutes outside the day to the edges', () => {
    expect(xOf(0, 300)).toBe(0);
    expect(xOf(1500, 300)).toBe(300);
    expect(minuteAt(-20, 300)).toBe(DAY_FROM);
    expect(minuteAt(900, 300)).toBe(DAY_TO);
  });

  it('keeps a zero-width strip from producing NaN', () => {
    expect(minuteAt(10, 0)).toBe(DAY_FROM);
  });

  it('snaps chosen times to the five-minute grid', () => {
    expect(minuteAt(87, 1000) % 5).toBe(0);
  });

  it('reads the day and the minute of day from the absolute clock', () => {
    expect(dayStartOf(420)).toBe(0);
    expect(dayStartOf(1440 + 61)).toBe(1440);
    expect(minuteOfDay(1440 + 61)).toBe(61);
    expect(minuteOfDay(-30)).toBe(1410);
  });
});

describe('peak bands', () => {
  it('come from the simulation definition: morning 05:00-10:00, evening 16:00-20:00', () => {
    expect(peakBands()).toEqual([[300, 600], [960, 1200]]);
  });
});

describe('disruption spans', () => {
  const base = { id: 'a', label: 'Blue line closure', recoveryMin: 20 };

  it('covers the incident and its recovery, in minutes of the current day', () => {
    const s = incidentSpans([{ ...base, status: 'active', startMin: 1440 + 600, durationMin: 60 }], 1440);
    expect(s).toEqual([{ id: 'a', label: 'Blue line closure', status: 'active', from: 600, to: 680 }]);
  });

  it('clips to the strip and drops anything outside it', () => {
    const early = incidentSpans([{ ...base, status: 'active', startMin: 100, durationMin: 200 }], 0);
    expect(early[0].from).toBe(DAY_FROM);
    expect(incidentSpans([{ ...base, status: 'scheduled', startMin: 2000, durationMin: 30 }], 0)).toEqual([]);
  });

  it('leaves resolved incidents off the strip', () => {
    expect(incidentSpans([{ ...base, status: 'resolved', startMin: 600, durationMin: 30 }], 0)).toEqual([]);
  });
});

describe('trace', () => {
  it('needs two points to draw a line', () => {
    expect(tracePoints([point(500, 1, 1)], 0, 100, 30)).toBe('');
  });

  it('normalises to the busiest moment and ignores other days', () => {
    const pts = tracePoints(
      [point(300, 0, 0), point(600, 5, 5), point(900, 0, 0), point(1440 + 600, 99, 99)],
      0,
      120,
      30,
    );
    const ys = pts.split(' ').map((p) => Number(p.split(',')[1]));
    expect(ys).toHaveLength(3);
    expect(ys[1]).toBeLessThan(ys[0]);
    expect(ys[1]).toBeLessThan(ys[2]);
  });
});

describe('run until', () => {
  it('only reaches forward in the current day', () => {
    expect(runTargetFor(720, 420)).toBe(720);
    expect(runTargetFor(420, 420)).toBeNull();
    expect(runTargetFor(300, 420)).toBeNull();
    expect(runTargetFor(720, 1440 + 420)).toBe(1440 + 720);
  });

  it('nudges forward from the next grid step', () => {
    expect(nudgeTarget(null, 427, 30)).toBe(460);
    expect(nudgeTarget(460, 427, 30)).toBe(490);
  });

  it('stops at the last grid point of the day instead of cancelling', () => {
    expect(nudgeTarget(1430, 427, 30)).toBe(1435);
    expect(nudgeTarget(1435, 427, 30)).toBe(1435);
  });

  it('steps back to the earliest reachable time, and cancels only from there', () => {
    expect(nudgeTarget(460, 427, -30)).toBe(430);
    expect(nudgeTarget(430, 427, -30)).toBeNull();
    expect(nudgeTarget(null, 427, -30)).toBeNull();
  });

  it('has nothing to offer once the day is over', () => {
    expect(nudgeTarget(null, 1438, 30)).toBeNull();
  });
});

describe('rewinding the day strip', () => {
  const NOW = 12 * 60; // 12:00 on the first day

  it('offers a minute that has passed, and not one still to come', () => {
    expect(rewindTargetFor(10 * 60, NOW)).toBe(10 * 60);
    expect(rewindTargetFor(14 * 60, NOW)).toBeNull();
    expect(rewindTargetFor(12 * 60, NOW)).toBeNull();
  });

  it('cannot go before the day began (07:00 on day one)', () => {
    expect(rewindTargetFor(6 * 60, NOW)).toBeNull();
    expect(rewindTargetFor(7 * 60, NOW)).toBe(7 * 60);
  });

  it('can reach the early hours of a later day', () => {
    const day2 = 1440 + 12 * 60;
    expect(rewindTargetFor(5 * 60, day2)).toBe(1440 + 5 * 60);
    expect(rewindTargetFor(3 * 60, day2)).toBeNull();
  });

  it('and the future is still a run-to, not a rewind', () => {
    expect(runTargetFor(10 * 60, NOW)).toBeNull();
    expect(runTargetFor(14 * 60, NOW)).toBe(14 * 60);
  });

  it('steps back on the grid and stops at the start of the day', () => {
    expect(nudgeRewind(null, NOW, 30)).toBe(11 * 60 + 30);
    expect(nudgeRewind(11 * 60 + 30, NOW, 30)).toBe(11 * 60);
    expect(nudgeRewind(7 * 60 + 15, NOW, 30)).toBe(7 * 60);
    expect(nudgeRewind(7 * 60, NOW, 30)).toBe(7 * 60);
  });

  it('steps forward again and drops the target on reaching now', () => {
    expect(nudgeRewind(11 * 60, NOW, -30)).toBe(11 * 60 + 30);
    expect(nudgeRewind(11 * 60 + 30, NOW, -30)).toBeNull();
  });

  it('puts a target on the grid when now is between grid points', () => {
    expect(nudgeRewind(null, 12 * 60 + 3, 30)).toBe(11 * 60 + 30);
  });

  it('gives nothing to step back to at the very start of the day', () => {
    expect(nudgeRewind(null, 7 * 60, 30)).toBeNull();
  });

  it('nudgePending walks through the past and the future from now', () => {
    expect(nudgePending(null, NOW, 'earlier', 30)).toBe(11 * 60 + 30);
    expect(nudgePending(null, NOW, 'later', 30)).toBe(12 * 60 + 35);
    expect(nudgePending(11 * 60 + 30, NOW, 'later', 30)).toBeNull();
    expect(nudgePending(11 * 60, NOW, 'later', 30)).toBe(11 * 60 + 30);
    expect(nudgePending(12 * 60 + 35, NOW, 'earlier', 30)).toBe(12 * 60 + 5);
    expect(nudgePending(12 * 60 + 5, NOW, 'earlier', 30)).toBeNull();
    expect(nudgePending(11 * 60 + 30, NOW, 'earlier', 30)).toBe(11 * 60);
  });
});
