import { describe, expect, it } from 'vitest';
import { generateCity } from '../city/generateCity.ts';
import { buildNetwork } from '../transport/network.ts';
import { applyEdits } from '../scenario/applyEdits.ts';
import { validateIncidentConfig } from '../scenario/applyEdits.ts';
import { DEMOS, demoBrief, demoById } from '../scenario/demos.ts';
import { horizonFor } from '../planning/briefs.ts';
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

  it('gives every demo a usable brief, generated or synthesized', () => {
    // A demo must never silently point at a brief the city's facts do not
    // generate: the objectives chip and the evaluation would both go quiet.
    for (const d of DEMOS) {
      const synthesized = demoBrief(d);
      expect(synthesized.title.length).toBeGreaterThan(0);
      expect(synthesized.paragraphs.length).toBeGreaterThan(0);
      expect(synthesized.objectives.length).toBeGreaterThan(0);
      expect(synthesized.constraints.length).toBeGreaterThan(0);
      expect(synthesized.horizonYears).toBe(horizonFor(d.difficulty));
      // A briefed demo resolves to that id, so a generated brief of the same
      // id can win; an unbriefed one resolves to its own id.
      expect(synthesized.id).toBe(d.briefId ?? `demo-${d.id}`);
      // Every objective must be evaluable on its own terms.
      for (const o of synthesized.objectives) {
        expect(METRICS).toContain(o.metric);
        expect(['<', '>', '<=', '>=']).toContain(o.op);
        expect(Number.isFinite(o.target)).toBe(true);
      }
    }
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
