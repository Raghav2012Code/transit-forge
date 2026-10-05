import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatClock } from '../../simulation/index.ts';
import type { SeriesPoint } from '../../simulation/analytics/series.ts';
import type { Incident } from '../../types/index.ts';
import {
  DAY_FROM,
  DAY_TO,
  dayStartOf,
  incidentSpans,
  minuteAt,
  minuteOfDay,
  nudgeTarget,
  peakBands,
  runTargetFor,
  tracePoints,
  xOf,
} from './dayStrip.ts';

interface Props {
  timeMinutes: number;
  history: SeriesPoint[];
  incidents: Incident[];
  /** Absolute minute the sim is running toward, if any. */
  runTarget: number | null;
  onRunTo: (absoluteMinute: number) => void;
}

const H = 44;
const HOURS = [6, 9, 12, 15, 18, 21];
const KEY_STEP = 30;

/**
 * The service day on one axis, drawn the way a timetable is: peaks shaded,
 * disruptions as bars, the day's load as a trace, and a needle for now.
 * Pointing at the future offers "run to"; the past cannot be revisited
 * because the day would have to be replayed.
 */
export default function DayStrip({ timeMinutes, history, incidents, runTarget, onRunTo }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setW(Math.round(el.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dayStart = dayStartOf(timeMinutes);
  const now = minuteOfDay(timeMinutes);
  const nowX = xOf(now, w);
  const spans = incidentSpans(incidents, dayStart);
  const trace = tracePoints(history, dayStart, w, H);

  const hoverTarget = hoverX === null ? null : runTargetFor(minuteAt(hoverX, w), timeMinutes);
  const shown = pending ?? hoverTarget;
  const shownMinute = shown === null ? null : minuteOfDay(shown);
  const goingTo = runTarget !== null ? minuteOfDay(runTarget) : null;

  const pointerX = (e: PointerEvent<HTMLDivElement>) => e.clientX - (box.current?.getBoundingClientRect().left ?? 0);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setPending(nudgeTarget(pending, timeMinutes, KEY_STEP));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setPending(pending === null ? null : nudgeTarget(pending, timeMinutes, -KEY_STEP));
    } else if (e.key === 'Enter' && pending !== null) {
      e.preventDefault();
      onRunTo(pending);
      setPending(null);
    } else if (e.key === 'Escape' && pending !== null) {
      e.stopPropagation();
      setPending(null);
    }
  };

  return (
    <div
      className="tf-strip"
      ref={box}
      role="slider"
      tabIndex={0}
      aria-label="Service day. Arrow keys choose a later time, Enter runs the simulation until then."
      aria-valuemin={DAY_FROM}
      aria-valuemax={DAY_TO}
      aria-valuenow={now}
      aria-valuetext={`Now ${formatClock(timeMinutes)}${pending !== null ? `, run until ${formatClock(pending)}` : ''}`}
      onPointerMove={(e) => setHoverX(pointerX(e))}
      onPointerLeave={() => setHoverX(null)}
      onClick={(e) => {
        const t = runTargetFor(minuteAt(e.clientX - (box.current?.getBoundingClientRect().left ?? 0), w), timeMinutes);
        if (t !== null) onRunTo(t);
      }}
      onKeyDown={onKey}
      onBlur={() => setPending(null)}
      data-reaching={shown !== null ? 'true' : undefined}
    >
      {w > 0 && (
        <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} aria-hidden="true" focusable="false">
          {peakBands().map(([a, b]) => (
            <rect key={a} className="tf-strip-peak" x={xOf(a, w)} y={0} width={xOf(b, w) - xOf(a, w)} height={H} />
          ))}
          <rect className="tf-strip-past" x={0} y={0} width={nowX} height={H} />
          {HOURS.map((h) => (
            <g key={h}>
              <line className="tf-strip-tick" x1={xOf(h * 60, w)} x2={xOf(h * 60, w)} y1={H - 7} y2={H} />
              <text className="tf-strip-hour" x={xOf(h * 60, w) + 3} y={H - 2}>{String(h).padStart(2, '0')}</text>
            </g>
          ))}
          {trace && <polyline className="tf-strip-trace" points={trace} fill="none" />}
          {spans.map((s) => (
            <rect
              key={s.id}
              className={`tf-strip-incident ${s.status}`}
              x={xOf(s.from, w)}
              y={4}
              width={Math.max(3, xOf(s.to, w) - xOf(s.from, w))}
              height={6}
              rx={1}
            >
              <title>{s.label}</title>
            </rect>
          ))}
          {goingTo !== null && <line className="tf-strip-target" x1={xOf(goingTo, w)} x2={xOf(goingTo, w)} y1={0} y2={H} />}
          {shownMinute !== null && <line className="tf-strip-ghost" x1={xOf(shownMinute, w)} x2={xOf(shownMinute, w)} y1={0} y2={H} />}
          <line className="tf-strip-now" x1={nowX} x2={nowX} y1={0} y2={H} />
          <path className="tf-strip-flag" d={`M${nowX - 4} 0h8l-4 5z`} />
        </svg>
      )}
      {shownMinute !== null && (
        <span className="tf-strip-tip" style={{ left: Math.min(Math.max(xOf(shownMinute, w), 28), Math.max(28, w - 28)) }}>
          Run to {formatClock(shown ?? 0)}
        </span>
      )}
      {goingTo !== null && shownMinute === null && (
        <span className="tf-strip-tip going" style={{ left: Math.min(Math.max(xOf(goingTo, w), 28), Math.max(28, w - 28)) }}>
          Running to {formatClock(runTarget ?? 0)}
        </span>
      )}
    </div>
  );
}
