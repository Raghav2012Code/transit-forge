import { describe, expect, it } from 'vitest';
import { generateCity } from '../city/generateCity.ts';
import { buildNetwork } from '../transport/network.ts';
import { applyEdits } from '../scenario/applyEdits.ts';
import { validateIncidentConfig } from '../scenario/applyEdits.ts';
import { DEMOS, demoById } from '../scenario/demos.ts';
import type { MetricKey } from '../planning/objectives.ts';

const SEED = 1337;
const METRICS: MetricKey[] = [
  'avg-travel', 'avg-wait', 'peak-crowding', 'transit-share', 'car-share',
  'congestion', 'accessibility', 'coverage', 'denied', 'op-cost',
  'construction-cost', 'population', 'jobs', 'resilience-score',
  'revenue', 'cost-recovery', 'subsidy',
  'access-zone', 'crowd-route', 'road-vc',
];

describe('demo scenarios', () => {
  it('ships exactly the five curated demos with complete metadata', () => {
    expect(DEMOS.map((d) => d.id)).toEqual([
      'demo-downtown', 'demo-airport', 'demo-corridor', 'demo-resilience', 'demo-growth',
    ]);
    for (const d of DEMOS) {
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.description.length).toBeGreaterThan(20);
      expect(d.minutes).toBeGreaterThan(0);
      expect(d.systems.length).toBeGreaterThanOrEqual(3);
      expect(d.objectives.length).toBeGreaterThan(0);
      expect(d.intro.length).toBeGreaterThan(0);
      expect(d.suggestions.length).toBeGreaterThan(0);
      expect(demoById(d.id)).toBe(d);
    }
    expect(demoById('nope')).toBeNull();
  });

  it('applies every demo cleanly and deterministically', () => {
    const city = generateCity(SEED);
    const base = buildNetwork();
    for (const d of DEMOS) {
      const a = applyEdits(city, base, d.ops);
      expect(a.warnings).toEqual([]);
      const b = applyEdits(city, base, d.ops);
      expect(JSON.stringify({ ...b, city: b.city.zones.length })).toBe(
        JSON.stringify({ ...a, city: a.city.zones.length }),
      );
      expect(a.cost).toBeGreaterThanOrEqual(0);
    }
  });

  it('references real stations, routes, zones, and metrics', () => {
    const city = generateCity(SEED);
    const base = buildNetwork();
    const stationIds = new Set(base.stations.map((s) => s.id));
    const routeIds = new Set(base.routes.map((r) => r.id));
    const zoneIds = new Set(city.zones.map((z) => z.id));
    const edgeIds = new Set(city.roadEdges.map((e) => e.id));
    for (const d of DEMOS) {
      for (const o of d.objectives) {
        expect(METRICS).toContain(o.metric);
        if (o.metric === 'access-zone') expect(zoneIds.has(o.targetId ?? '')).toBe(true);
        if (o.metric === 'crowd-route') expect(routeIds.has(o.targetId ?? '')).toBe(true);
        if (o.metric === 'road-vc') expect(edgeIds.has(o.targetId ?? '')).toBe(true);
      }
      for (const op of d.ops) {
        if (op.type === 'setService') expect(routeIds.has(op.routeId)).toBe(true);
        if (op.type === 'extendRoute') {
          expect(routeIds.has(op.routeId)).toBe(true);
          for (const sid of op.stationIds) expect(stationIds.has(sid)).toBe(true);
        }
        if (op.type === 'addRoute') {
          for (const sid of op.route.stationIds) expect(stationIds.has(sid)).toBe(true);
        }
        if (op.type === 'scheduleIncident') {
          expect(validateIncidentConfig(op.incident, stationIds, routeIds, edgeIds)).toEqual([]);
        }
      }
    }
  });
});
