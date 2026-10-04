import type { SimStats } from '../../types/index.ts';

export default function StatsPanel({ stats }: { stats: SimStats }) {
  const rows: [string, string][] = [
    ['Population', stats.population.toLocaleString()],
    ['Jobs', stats.jobs.toLocaleString()],
    ['Stations', String(stats.stationCount)],
    ['Routes', String(stats.routeCount)],
    ['Vehicles', String(stats.vehicleCount)],
    ['Waiting now', stats.waitingTotal.toLocaleString()],
    ['Boarded today', stats.boardedDay.toLocaleString()],
    ['Avg wait', `${stats.avgWaitMin} min`],
  ];
  return (
    <div className="tf-stats">
      <h3>Network statistics</h3>
      <dl>
        {rows.map(([k, val]) => (
          <div key={k} className="tf-stat-row">
            <dt>{k}</dt>
            <dd>{val}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
