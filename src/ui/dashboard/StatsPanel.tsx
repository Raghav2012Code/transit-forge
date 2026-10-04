import type { SimStats } from '../../types/index.ts';

function Section({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="tf-stats">
      <h3>{title}</h3>
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

export default function StatsPanel({ stats }: { stats: SimStats }) {
  return (
    <>
      <Section
        title="Network"
        rows={[
          ['Population', stats.population.toLocaleString()],
          ['Daily trips', stats.generated.toLocaleString()],
          ['Completed', stats.completed.toLocaleString()],
          ['Active now', stats.activeNow.toLocaleString()],
          ['Mode split M/R/B', `${stats.metroShare}/${stats.railShare}/${stats.busShare}%`],
        ]}
      />
      <Section
        title="Passenger experience"
        rows={[
          ['Avg travel', `${stats.avgTravelMin} min`],
          ['Avg wait', `${stats.avgWaitMin} min`],
          ['Avg transfers', String(stats.avgTransfers)],
          ['Waiting now', stats.waitingNow.toLocaleString()],
          ['Onboard now', stats.onboardNow.toLocaleString()],
        ]}
      />
      <Section
        title="Infrastructure"
        rows={[
          ['Most used st', `${stats.topStation} (${stats.topStationCount.toLocaleString()})`],
          ['Crowded now', `${stats.crowdedStation} (${stats.crowdedCount.toLocaleString()})`],
          ['Top route', `${stats.topRoute} (${stats.topRouteCount.toLocaleString()})`],
          ['Max occupancy', `${stats.maxOccupancy}%`],
        ]}
      />
      <Section
        title="Roads"
        rows={[
          ['Road trips', stats.roadTrips.toLocaleString()],
          ['Active cars', stats.activeCars.toLocaleString()],
          ['Avg road time', `${stats.avgRoadMin} min`],
          ['Avg congestion', String(stats.avgCongestion)],
          ['Worst road', `${stats.worstRoad} (${stats.worstVC})`],
        ]}
      />
      <Section
        title="Multimodal"
        rows={[
          ['Transit share', `${stats.transitShare}%`],
          ['Car share', `${stats.carShare}%`],
          ['Avg transit time', `${stats.avgTransitMin} min`],
          ['Avg road time', `${stats.avgRoadMin} min`],
        ]}
      />
    </>
  );
}
