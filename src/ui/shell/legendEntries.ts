import type { Overlay } from '../../rendering/SceneView.tsx';
import { getPalette, hexColor as hex, type Theme } from '../../rendering/palette.ts';

export type Entry =
  | { kind: 'ramp'; title: string; gradient: string; lo: string; hi: string; note?: string }
  | { kind: 'keys'; title: string; rows: { color: string; label: string }[] };

/**
 * Legend keys are generated from the same palette the scene paints with, so a
 * ramp or a condition swatch can never drift from the values on the map.
 */
export function legendEntries(theme: Theme): Partial<Record<Overlay, Entry>> {
  const { condition: C, ramp: R } = getPalette(theme);
  const ramp = (lo: number, hi: number) => `linear-gradient(90deg, ${hex(lo)}, ${hex(hi)})`;
  return {
    congestion: {
      kind: 'ramp', title: 'Road congestion', lo: 'free', hi: 'severe',
      gradient: `linear-gradient(90deg, ${hex(C.congestion.free)}, ${hex(C.congestion.light)} 30%, ${hex(C.congestion.moderate)} 55%, ${hex(C.congestion.heavy)} 78%, ${hex(C.congestion.severe)})`,
    },
    accessibility: {
      kind: 'ramp', title: 'Accessibility', lo: 'excellent', hi: 'very poor',
      gradient: `linear-gradient(90deg, ${hex(C.grade.excellent)}, ${hex(C.grade.good)} 25%, ${hex(C.grade.moderate)} 50%, ${hex(C.grade.poor)} 75%, ${hex(C.grade['very poor'])})`,
    },
    traveltime: {
      kind: 'ramp', title: 'Travel time', lo: 'fast', hi: 'slow',
      gradient: `linear-gradient(90deg, ${hex(C.good)}, ${hex(C.congestion.light)}, ${hex(C.hot)})`, note: 'grey = unreachable',
    },
    coverage: {
      kind: 'ramp', title: 'Covered population', lo: '0%', hi: '100%',
      gradient: ramp(R.blueLow, R.blueHigh),
    },
    popdensity: {
      kind: 'ramp', title: 'Population density', lo: 'low', hi: 'max',
      gradient: ramp(R.blueLow, R.blueHigh),
    },
    jobdensity: {
      kind: 'ramp', title: 'Job density', lo: 'low', hi: 'max',
      gradient: ramp(R.blueLow, R.blueHigh),
    },
    development: {
      kind: 'ramp', title: 'Developed share', lo: '0%', hi: '100%',
      gradient: `linear-gradient(90deg, ${hex(R.none)}, ${hex(C.good)} 25%, ${hex(C.congestion.light)} 50%, ${hex(C.warn)} 75%, ${hex(C.alarm)})`,
    },
    growth: {
      kind: 'ramp', title: 'Population growth', lo: 'low', hi: 'max',
      gradient: ramp(R.greenLow, R.greenHigh),
    },
    demand: {
      kind: 'ramp', title: 'Trip demand', lo: 'low', hi: 'max',
      gradient: `linear-gradient(90deg, ${hex(C.good)}, ${hex(C.congestion.light)}, ${hex(C.hot)})`,
    },
    critical: {
      kind: 'ramp', title: 'Criticality', lo: 'redundant', hi: 'single point',
      gradient: ramp(R.blueLow, C.alarm),
    },
    load: {
      kind: 'ramp', title: 'Platform load', lo: 'empty', hi: 'over capacity',
      gradient: `linear-gradient(90deg, ${hex(R.blueLow)}, ${hex(C.good)} 45%, ${hex(C.alarm)})`,
    },
    frequency: {
      kind: 'ramp', title: 'Service frequency', lo: 'rare', hi: 'dense',
      gradient: ramp(R.greenLow, R.greenHigh),
    },
    crowding: {
      kind: 'ramp', title: 'Vehicle crowding', lo: 'seated', hi: 'crushed',
      gradient: `linear-gradient(90deg, ${hex(R.blueLow)}, ${hex(C.warn)} 60%, ${hex(C.alarm)})`,
    },
    flow: {
      kind: 'keys', title: 'Line colours', rows: [
        { color: 'var(--mode-metro)', label: 'Metro' },
        { color: 'var(--mode-rail)', label: 'Rail' },
        { color: 'var(--mode-bus)', label: 'Bus' },
      ],
    },
    normal: {
      kind: 'keys', title: 'Line colours', rows: [
        { color: 'var(--mode-metro)', label: 'Metro' },
        { color: 'var(--mode-rail)', label: 'Rail' },
        { color: 'var(--mode-bus)', label: 'Bus' },
      ],
    },
    bottlenecks: {
      kind: 'keys', title: 'Flagged', rows: [
        { color: hex(C.alarm), label: 'Capacity bottleneck' },
        { color: 'var(--mode-metro)', label: 'Other stations' },
      ],
    },
    status: {
      kind: 'keys', title: 'Network status', rows: [
        { color: hex(C.alarm), label: 'Suspended / closed' },
        { color: hex(C.warn), label: 'Reduced service' },
        { color: hex(C.good), label: 'Normal' },
      ],
    },
  };
}
