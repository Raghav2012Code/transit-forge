// Geometry for the service-day strip. Pure functions: minutes in, pixels out.
// The strip shows the operating day (04:00 to 24:00) so the peaks, the
// disruptions and the clock read on one axis, the way a timetable does.
import { START_MIN } from '../../simulation/index.ts';
import { isPeak } from '../../simulation/service/servicePlan.ts';
import type { SeriesPoint } from '../../simulation/analytics/series.ts';
import type { IncidentStatus } from '../../types/index.ts';

export const DAY_FROM = 240;
export const DAY_TO = 1440;
const SPAN = DAY_TO - DAY_FROM;
/** Run-until targets land on this grid, so the label is always a tidy time. */
export const TARGET_STEP = 5;

export function dayStartOf(timeMinutes: number): number {
  return Math.floor(timeMinutes / 1440) * 1440;
}

export function minuteOfDay(timeMinutes: number): number {
  return ((timeMinutes % 1440) + 1440) % 1440;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Minute of day to a pixel across `width`. Outside the day it pins to the edge. */
export function xOf(minute: number, width: number): number {
  return clamp01((minute - DAY_FROM) / SPAN) * width;
}

/** A pixel back to a minute of day, on the target grid. */
export function minuteAt(x: number, width: number): number {
  if (width <= 0) return DAY_FROM;
  const raw = DAY_FROM + clamp01(x / width) * SPAN;
  return Math.round(raw / TARGET_STEP) * TARGET_STEP;
}

let peaks: [number, number][] | null = null;

/** Contiguous peak periods inside the day, read from the sim's own definition. */
export function peakBands(): [number, number][] {
  if (peaks) return peaks;
  const out: [number, number][] = [];
  let from: number | null = null;
  for (let m = DAY_FROM; m <= DAY_TO; m++) {
    const on = m < DAY_TO && isPeak(m);
    if (on && from === null) from = m;
    if (!on && from !== null) {
      out.push([from, m]);
      from = null;
    }
  }
  peaks = out;
  return out;
}

export interface IncidentLike {
  id: string;
  label: string;
  status: IncidentStatus;
  startMin: number;
  durationMin: number;
  recoveryMin: number;
}

export interface IncidentSpan {
  id: string;
  label: string;
  status: IncidentStatus;
  from: number;
  to: number;
}

/** Disruptions on the current day, clipped to the strip. Resolved ones are history, not drawn. */
export function incidentSpans(incidents: IncidentLike[], dayStart: number): IncidentSpan[] {
  const out: IncidentSpan[] = [];
  for (const i of incidents) {
    if (i.status === 'resolved') continue;
    const from = Math.max(DAY_FROM, i.startMin - dayStart);
    const to = Math.min(DAY_TO, i.startMin + i.durationMin + i.recoveryMin - dayStart);
    if (to <= DAY_FROM || from >= DAY_TO || to <= from) continue;
    out.push({ id: i.id, label: i.label, status: i.status, from, to });
  }
  return out;
}

/** People in the network (waiting or riding) across today, as a polyline in a width x height box. */
export function tracePoints(history: SeriesPoint[], dayStart: number, width: number, height: number): string {
  const today = history.filter((p) => p.t >= dayStart + DAY_FROM && p.t <= dayStart + DAY_TO);
  if (today.length < 2) return '';
  let max = 1;
  for (const p of today) max = Math.max(max, p.waiting + p.onboard);
  return today
    .map((p) => {
      const x = xOf(p.t - dayStart, width);
      const y = height - 2 - ((p.waiting + p.onboard) / max) * (height - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** What committing a chosen minute does: play forward, or replay the day back. */
export interface Seek {
  kind: 'run' | 'replay';
  absolute: number;
}

/**
 * The chosen minute of day as an absolute sim minute, and which way it goes.
 * Null for the minute the clock is already on, and for a minute before the
 * session's first (the strip draws from 04:00 but the run starts at 07:00).
 */
export function seekFor(chosenMinuteOfDay: number, timeMinutes: number): Seek | null {
  const absolute = dayStartOf(timeMinutes) + chosenMinuteOfDay;
  if (absolute === timeMinutes) return null;
  if (absolute > timeMinutes) return { kind: 'run', absolute };
  return absolute >= dayStartOf(timeMinutes) + START_MIN ? { kind: 'replay', absolute } : null;
}

/**
 * One keyboard step on the grid. The marker may cross the clock in both
 * directions: a forward step stops at the last grid point of the day, a
 * backward step stops at the first minute of the run and cancels from there,
 * so there is always a way out that is not Escape.
 */
export function nudgeTarget(current: number | null, timeMinutes: number, stepMinutes: number): number | null {
  if (stepMinutes === 0) return null;
  const day = dayStartOf(timeMinutes);
  const earliest = day + START_MIN;
  const latest = day + DAY_TO - TARGET_STEP;
  const now = minuteOfDay(timeMinutes);
  const edge =
    stepMinutes > 0
      ? Math.ceil((now + 1) / TARGET_STEP) * TARGET_STEP
      : Math.floor(now / TARGET_STEP) * TARGET_STEP;
  if (current === null && stepMinutes > 0 && edge > latest) return null;
  const next = current === null ? day + edge + stepMinutes : day + minuteOfDay(current) + stepMinutes;
  if (next < earliest) {
    // Clamp a backward step to the run's first minute; from there it cancels.
    return current !== null && minuteOfDay(current) <= START_MIN ? null : earliest;
  }
  return Math.min(latest, next);
}
