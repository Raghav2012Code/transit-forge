// Geometry for the service-day strip. Pure functions: minutes in, pixels out.
// The strip shows the operating day (04:00 to 24:00) so the peaks, the
// disruptions and the clock read on one axis, the way a timetable does.
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

/**
 * The absolute sim minute to run until, for a chosen minute of day. Only the
 * future is reachable: a replay backwards would mean re-running the day.
 */
export function runTargetFor(chosenMinuteOfDay: number, timeMinutes: number): number | null {
  const target = dayStartOf(timeMinutes) + chosenMinuteOfDay;
  return target > timeMinutes ? target : null;
}

/**
 * One keyboard step on the grid. Forward stops at the last grid point of the
 * day. Backward stops at the earliest reachable time; pressing back again
 * from there cancels, so there is always a way out that is not Escape.
 */
export function nudgeTarget(current: number | null, timeMinutes: number, stepMinutes: number): number | null {
  const day = dayStartOf(timeMinutes);
  const now = minuteOfDay(timeMinutes);
  const earliest = Math.ceil((now + 1) / TARGET_STEP) * TARGET_STEP;
  const latest = DAY_TO - TARGET_STEP;
  if (earliest > latest) return null;
  if (current === null) {
    if (stepMinutes <= 0) return null;
    return day + Math.min(latest, earliest + stepMinutes);
  }
  const base = minuteOfDay(current);
  const next = base + stepMinutes;
  if (next < earliest) return base > earliest ? day + earliest : null;
  return day + Math.min(latest, next);
}
