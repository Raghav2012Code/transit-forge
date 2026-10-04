import type { SimStats } from '../../types/index.ts';
import Kpi from '../shell/Kpi.tsx';

function Section({ title, rows, tone }: { title: string; rows: [string, string][]; tone?: 'alert' }) {
  return (
    <div className="tf-stats" style={tone === 'alert' ? { borderColor: 'var(--bad)' } : undefined}>
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
  const congTone = stats.avgCongestion >= 0.85 ? 'bad' : stats.avgCongestion >= 0.7 ? 'warn' : 'good';
  const occTone = stats.maxOccupancy >= 95 ? 'bad' : stats.maxOccupancy >= 85 ? 'warn' : 'good';
  return (
    <>
      <div className="tf-kpis">
        <Kpi
          label="Transit share"
          value={stats.transitShare.toFixed(0)}
          unit="%"
          meter={stats.transitShare / 100}
          tone={stats.transitShare >= 60 ? 'good' : stats.transitShare >= 45 ? 'plain' : 'warn'}
          sub={`${stats.carShare}% by car`}
        />
        <Kpi
          label="Avg travel"
          value={stats.avgTravelMin.toFixed(1)}
          unit="min"
          meter={Math.min(1, stats.avgTravelMin / 45)}
          tone={stats.avgTravelMin > 30 ? 'warn' : 'good'}
          sub={`${stats.avgTransfers} transfers`}
        />
        <Kpi
          label="Avg wait"
          value={stats.avgWaitMin.toFixed(1)}
          unit="min"
          meter={Math.min(1, stats.avgWaitMin / 12)}
          tone={stats.avgWaitMin > 8 ? 'warn' : 'good'}
          sub={`${stats.avgHeadway}m headway`}
        />
        <Kpi
          label="Congestion"
          value={stats.avgCongestion.toFixed(2)}
          meter={Math.min(1, stats.avgCongestion)}
          threshold={0.85}
          tone={congTone}
          sub={`worst ${stats.worstVC}`}
        />
      </div>

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
          ['Waiting now', stats.waitingNow.toLocaleString()],
          ['Onboard now', stats.onboardNow.toLocaleString()],
          ['Peak occupancy', `${stats.maxOccupancy}%`],
          ['Avg occupancy', `${stats.avgOcc}%`],
          ['Denied boardings', stats.deniedBoardings.toLocaleString()],
          ['Delays accrued', `${stats.totalDelayMin} min`],
        ]}
      />
      <Section
        title="Infrastructure"
        rows={[
          ['Most used st', `${stats.topStation} (${stats.topStationCount.toLocaleString()})`],
          ['Crowded now', `${stats.crowdedStation} (${stats.crowdedCount.toLocaleString()})`],
          ['Top route', `${stats.topRoute} (${stats.topRouteCount.toLocaleString()})`],
        ]}
      />
      <Section
        title="Roads"
        rows={[
          ['Road trips', stats.roadTrips.toLocaleString()],
          ['Active cars', stats.activeCars.toLocaleString()],
          ['Avg road time', `${stats.avgRoadMin} min`],
          ['Worst road', `${stats.worstRoad} (${stats.worstVC})`],
        ]}
      />
      <Section
        title="Finance"
        rows={[
          ['Fare revenue', `${stats.revenue.toLocaleString()} OCU`],
          ['Metro / rail / bus', `${stats.revenueMetro.toLocaleString()} / ${stats.revenueRail.toLocaleString()} / ${stats.revenueBus.toLocaleString()}`],
          ['Cost recovery', `${stats.costRecovery}%`],
          ['Subsidy', `${stats.subsidy.toLocaleString()} OCU`],
        ]}
      />
      <Section
        title="Service"
        rows={[
          ['Active vehicles', String(stats.vehicleCount)],
          ['Vehicle-hours', String(stats.vehHr)],
          ['Vehicle-km', String(stats.vehKm)],
          ['Op. cost', `${stats.opCost.toLocaleString()} OCU`],
          ['Cost / pax', `${stats.opCostPerPax} OCU`],
        ]}
      />
      {(stats.activeIncidents > 0 || stats.rerouted > 0) && (
        <Section
          title="Disruptions"
          tone="alert"
          rows={[
            ['Active incidents', String(stats.activeIncidents)],
            ['Rerouted', stats.rerouted.toLocaleString()],
            ['Stranded now', stats.strandedNow.toLocaleString()],
            ['Stranded peak', stats.strandedPeak.toLocaleString()],
            ['Cancelled trips', stats.cancelledTrips.toLocaleString()],
          ]}
        />
      )}
      <div className="tf-hint">
        Peak occupancy {stats.maxOccupancy >= 95 ? 'is above' : 'is below'} the 95% critical line
        {occTone === 'good' ? ' — capacity is holding.' : ' — boardings are being turned away.'}
      </div>
    </>
  );
}