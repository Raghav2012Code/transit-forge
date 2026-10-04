// Fare policy, revenue, and cost recovery. Pure TypeScript: no React,
// Three.js, browser, or random APIs. All money is in OCU (fictional
// Operating Cost Units, deliberately unit-free), matching operatingCost.
import type { TransportMode, TripCounters } from '../../types/index.ts';

/** Flat fare per transit mode, in OCU per trip. */
export interface FarePolicy {
  metro: number;
  rail: number;
  bus: number;
}

/**
 * Day-one default: free transit. Every existing baseline, test, and saved
 * scenario was built with no fare term in mode choice, so the default keeps
 * all of them bit-identical. Pricing is an opt-in lever, not a silent nerf.
 */
export const DEFAULT_FARES: FarePolicy = { metro: 0, rail: 0, bus: 0 };

/** Fares are whole OCU; 50 caps the lever where the response has saturated. */
export const MAX_FARE = 50;

/**
 * Utility lost per OCU of fare in mode choice. 10 OCU ≈ 5 min of travel time
 * (TIME_WEIGHT 0.12/min). A documented guess, not calibrated behavior.
 */
export const FARE_WEIGHT = 0.06;

function clampFare(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(MAX_FARE, Math.round(v)));
}

/** Clamp a fare policy to sane bounds (never throws on user input). */
export function sanitizeFares(fares: FarePolicy): FarePolicy {
  return { metro: clampFare(fares.metro), rail: clampFare(fares.rail), bus: clampFare(fares.bus) };
}

export type FareMode = 'metro' | 'rail' | 'bus';

/** Road access legs ride transit vehicles as bus passengers for pricing. */
export function fareModeFor(mode: TransportMode): FareMode {
  return mode === 'metro' || mode === 'rail' ? mode : 'bus';
}

/** Fare for one mode under a policy. */
export function fareFor(mode: FareMode, fares: FarePolicy): number {
  return fares[mode];
}

/**
 * Entry-mode pricing: a trip costs the fare of the mode boarded first
 * (one integrated ticket). Documented simplification — transfers are free.
 */
export function tripFare(firstLegMode: FareMode, fares: FarePolicy): number {
  return fareFor(firstLegMode, fares);
}

/**
 * Credit one completed trip's fare. Only completions earn: denied boardings,
 * stranded abandonments, and cancelled trips never reach this call.
 */
export function creditCompletedFare(
  counters: TripCounters,
  routeId: string,
  mode: FareMode,
  fare: number,
): void {
  if (fare <= 0) return;
  counters.revenueTotal += fare;
  counters.revenueByMode[mode] = (counters.revenueByMode[mode] ?? 0) + fare;
  counters.revenueByRoute[routeId] = (counters.revenueByRoute[routeId] ?? 0) + fare;
}

/** Cost recovery in percent (can exceed 100 when profitable). */
export function costRecoveryPct(revenue: number, opCost: number): number {
  if (opCost <= 0) return 0;
  return Math.round((revenue / opCost) * 1000) / 10;
}

/** Daily public money required (never negative). */
export function subsidyFor(revenue: number, opCost: number): number {
  return Math.max(0, Math.round(opCost - revenue));
}

/**
 * Informational break-even fare at current ridership. Holds ridership fixed,
 * so it overstates what a fare rise would actually earn — the UI must say so.
 */
export function breakEvenFare(routeOpCost: number, boarded: number): number {
  if (boarded <= 0) return 0;
  return Math.round((routeOpCost / boarded) * 100) / 100;
}
