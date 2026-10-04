// Deterministic binary mode choice (transit vs private car).
// Simple utility model: time, transfers, parking push travelers between modes.
// Constants are documented guesses, not calibrated behavior.
import type { DistrictKind } from '../../types/index.ts';
import { FARE_WEIGHT } from '../economics/fares.ts';

const TIME_WEIGHT = 0.12;
const TRANSFER_WEIGHT = 1.5;
const CAR_TIME_WEIGHT = 0.1;
const CAR_BASE_COST = 1.2; // ownership / parking / hassle
const CBD_PARKING_COST = 1.5;
const AIRPORT_CAR_BONUS = 0.5;

export function transitEstimate(pathMin: number, headways: number[]): number {
  // Ride + transfer penalties (in pathMin) plus expected initial wait per leg.
  return pathMin + headways.reduce((s, h) => s + h / 2, 0);
}

/**
 * Probability of choosing the car given both options' costs.
 * fareOCU is the trip's transit fare; 0 (the default) reproduces the
 * pre-fare behavior exactly. The logistic keeps the response smooth and
 * bounded: pricier transit shifts riders to cars, never to negative demand.
 */
export function carProbability(
  transitMin: number,
  transfers: number,
  roadMin: number,
  destKind: DistrictKind,
  fareOCU = 0,
): number {
  const uTransit = -TIME_WEIGHT * transitMin - TRANSFER_WEIGHT * transfers - FARE_WEIGHT * Math.max(0, fareOCU);
  let uCar = -CAR_TIME_WEIGHT * roadMin - CAR_BASE_COST;
  if (destKind === 'cbd') uCar -= CBD_PARKING_COST;
  if (destKind === 'airport') uCar += AIRPORT_CAR_BONUS;
  return 1 / (1 + Math.exp(-(uCar - uTransit)));
}

export function chooseMode(
  r: number,
  transitMin: number,
  transfers: number,
  roadMin: number,
  destKind: DistrictKind,
  fareOCU = 0,
): 'car' | 'transit' {
  return r < carProbability(transitMin, transfers, roadMin, destKind, fareOCU) ? 'car' : 'transit';
}
