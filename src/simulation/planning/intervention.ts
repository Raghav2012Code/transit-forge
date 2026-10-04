// Readable intervention summaries derived from scenario ops + networks.
// Everything reported comes from actual scenario state, never invented.
import type { NetworkData } from '../transport/network.ts';
import type { EditOp, ServicePatch } from '../scenario/scenario.ts';

export interface InterventionSummary {
  infra: string[];
  service: string[];
  roads: string[];
  newRouteKm: number;
  newStations: number;
  newBusRoutes: number;
  newRoadKm: number;
}

/** Summarize what a set of ops changed, resolved against base + mod networks. */
export function summarizeOps(
  ops: EditOp[],
  baseNet: NetworkData,
  modNet: { routes: { id: string; name: string; mode: string; stationIds: string[] }[]; routeLengths: Map<string, number> },
  modCityRoadKm: number,
  baseCityRoadKm: number,
): InterventionSummary {
  const infra: string[] = [];
  const service: string[] = [];
  const roads: string[] = [];
  let newStations = 0;
  let newBusRoutes = 0;
  for (const op of ops) {
    switch (op.type) {
      case 'addStation':
        newStations++;
        infra.push(`+ Station ${op.station.name}`);
        break;
      case 'removeStation':
        infra.push(`− Station ${op.stationId}`);
        break;
      case 'addRoute': {
        const len = modNet.routeLengths.get(op.route.id) ?? 0;
        if (op.route.mode === 'bus') {
          newBusRoutes++;
          infra.push(`+ Bus route ${op.route.name} (${op.route.stationIds.length} stops)`);
        } else {
          infra.push(`+ ${(len / 1000).toFixed(1)} km Metro ${op.route.name}`);
        }
        break;
      }
      case 'removeRoute':
        infra.push(`− Route ${op.routeId}`);
        break;
      case 'extendRoute': {
        const r = modNet.routes.find((x) => x.id === op.routeId);
        infra.push(`~ Extended ${r?.name ?? op.routeId} (+${op.stationIds.length} stations)`);
        break;
      }
      case 'addRoad':
        roads.push(`+ Road (${op.edges.length} segments, ${op.edges[0]?.kind ?? 'local'})`);
        break;
      case 'removeRoad':
        roads.push(`− Road ${op.edgeId}`);
        break;
      case 'setService': {
        const base = baseNet.routes.find((r) => r.id === op.routeId);
        const bits = describeServicePatch(op.patch);
        service.push(`${base?.name ?? op.routeId}: ${bits}`);
        break;
      }
      case 'scheduleIncident':
        infra.push(`◷ Planned disruption: ${op.incident.label}`);
        break;
    }
  }
  let newRouteKm = 0;
  for (const r of modNet.routes) {
    if (!baseNet.routes.some((b) => b.id === r.id) && r.mode === 'metro') {
      newRouteKm += (modNet.routeLengths.get(r.id) ?? 0) / 1000;
    }
  }
  return {
    infra,
    service,
    roads,
    newRouteKm: Math.round(newRouteKm * 10) / 10,
    newStations,
    newBusRoutes,
    newRoadKm: Math.round(Math.max(0, modCityRoadKm - baseCityRoadKm) * 10) / 10,
  };
}

function describeServicePatch(patch: ServicePatch): string {
  const bits: string[] = [];
  if (patch.peakHeadwayMin !== undefined) bits.push(`peak ${patch.peakHeadwayMin} min`);
  if (patch.offPeakHeadwayMin !== undefined) bits.push(`off-peak ${patch.offPeakHeadwayMin} min`);
  if (patch.fleetSize !== undefined) bits.push(`fleet ${patch.fleetSize}`);
  if (patch.vehicleCapacity !== undefined) bits.push(`capacity ${patch.vehicleCapacity}`);
  if (patch.speedKph !== undefined) bits.push(`${patch.speedKph} kph`);
  return bits.length > 0 ? bits.join(', ') : 'service tweak';
}
