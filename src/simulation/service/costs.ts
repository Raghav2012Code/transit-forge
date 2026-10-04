// Fictional operating-cost model in Operating Cost Units (OCU, deliberately
// unit-free). Costs scale with service supplied (vehicle-hours, vehicle-km)
// and fleet size, with per-mode rates.
import type { TransportMode } from '../../types/index.ts';

export interface CostRates {
  perVehHr: number;
  perVehKm: number;
  perVehicleDay: number;
}

const RATES: Record<string, CostRates> = {
  metro: { perVehHr: 42, perVehKm: 3.1, perVehicleDay: 180 },
  rail: { perVehHr: 55, perVehKm: 4.2, perVehicleDay: 260 },
  bus: { perVehHr: 16, perVehKm: 1.4, perVehicleDay: 60 },
};

export function costRatesFor(mode: TransportMode): CostRates {
  return RATES[mode] ?? RATES.bus;
}

/** Operating cost for accumulated service supplied. */
export function operatingCost(mode: TransportMode, vehHr: number, vehKm: number, fleet: number): number {
  const r = costRatesFor(mode);
  return vehHr * r.perVehHr + vehKm * r.perVehKm + fleet * r.perVehicleDay;
}

/** Marginal daily cost of moving from headway A to B over a cycle with N veh. */
export function marginalCostPerDay(mode: TransportMode, cycleMin: number, headwayA: number, headwayB: number, operatingMin: number): number {
  const r = costRatesFor(mode);
  const tripsA = operatingMin / Math.max(0.5, headwayA);
  const tripsB = operatingMin / Math.max(0.5, headwayB);
  const extraTrips = Math.max(0, tripsB - tripsA);
  // Each extra departure costs roughly one cycle of vehicle time.
  return extraTrips * ((cycleMin / 60) * r.perVehHr);
}
