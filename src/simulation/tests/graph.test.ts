import { describe, expect, it } from 'vitest';
import { findShortestPath } from '../transport/graph.ts';
import { buildNetwork, validateNetwork } from '../transport/network.ts';

describe('transport network', () => {
  it('has valid connections for every route', () => {
    const net = buildNetwork();
    expect(validateNetwork(net)).toEqual([]);
    expect(net.stations.length).toBeGreaterThanOrEqual(12);
    expect(net.routes.length).toBeGreaterThanOrEqual(5);
  });

  it('finds a path through the central interchange', () => {
    const net = buildNetwork();
    const path = findShortestPath(net.connections, 'st-north-res', 'st-university');
    expect(path).not.toBeNull();
    expect(path?.stationIds).toContain('st-central');
    expect(path?.totalMin ?? 0).toBeGreaterThan(0);
  });

  it('handles trivial and cross-line routes', () => {
    const net = buildNetwork();
    expect(findShortestPath(net.connections, 'st-central', 'st-central')?.totalMin).toBe(0);
    const cross = findShortestPath(net.connections, 'st-west-res', 'st-airport');
    expect(cross).not.toBeNull();
    expect(cross?.stationIds[0]).toBe('st-west-res');
    expect(cross?.stationIds[cross.stationIds.length - 1]).toBe('st-airport');
  });
});
