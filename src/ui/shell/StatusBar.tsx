import type { SimStats } from '../../types/index.ts';

interface Props {
  stats: SimStats;
  viewing: 'base' | 'scenario';
  incidents: number;
  opCost: number;
}

type Tone = '' | 'good' | 'warn' | 'bad';

function congTone(v: number): Tone {
  return v >= 0.85 ? 'bad' : v >= 0.7 ? 'warn' : 'good';
}
function occTone(v: number): Tone {
  return v >= 95 ? 'bad' : v >= 85 ? 'warn' : 'good';
}

/** Live readout strip under the viewport — always-on telemetry, no chrome. */
export default function StatusBar({ stats, viewing, incidents, opCost }: Props) {
  return (
    <div className="tf-statusbar" role="status" aria-live="off">
      <div className="tf-status-cell">
        <b>{viewing === 'base' ? 'BASELINE' : 'SCENARIO'}</b>
      </div>
      <div className="tf-status-cell">
        <span>transit</span><b>{stats.transitShare}%</b>
      </div>
      <div className="tf-status-cell">
        <span>congestion</span><b className={congTone(stats.avgCongestion)}>{stats.avgCongestion.toFixed(2)}</b>
      </div>
      <div className="tf-status-cell">
        <span>peak load</span><b className={occTone(stats.maxOccupancy)}>{stats.maxOccupancy}%</b>
      </div>
      <div className="tf-status-cell">
        <span>wait</span><b>{stats.avgWaitMin}m</b>
      </div>
      <div className="tf-status-cell">
        <span>travel</span><b>{stats.avgTravelMin}m</b>
      </div>
      <div className="tf-status-cell">
        <span>onboard</span><b>{stats.onboardNow.toLocaleString()}</b>
      </div>
      <div className="tf-status-cell">
        <span>waiting</span><b>{stats.waitingNow.toLocaleString()}</b>
      </div>
      <div className="tf-status-cell">
        <span>vehicles</span><b>{stats.vehicleCount}</b>
      </div>
      <div className="tf-status-cell">
        <span>done</span><b>{stats.completed.toLocaleString()}</b>
      </div>
      <div className="tf-status-cell">
        <span>op cost</span><b>{opCost.toLocaleString()}</b>
      </div>
      <div className={`tf-status-cell${incidents > 0 ? ' bad' : ''}`}>
        <span>incidents</span><b>{incidents}</b>
      </div>
    </div>
  );
}