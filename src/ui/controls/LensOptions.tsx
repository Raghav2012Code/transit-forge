import type { Overlay } from '../../rendering/SceneView.tsx';
import { DEMAND_LAYERS, TRAVEL_DESTS, WALK_STEPS, type DemandLayer, type TravelDest } from './lenses.ts';
import Seg from './Seg.tsx';

interface Props {
  overlay: Overlay;
  travelDest: TravelDest;
  onTravelDest: (d: TravelDest) => void;
  coverageThreshold: number;
  onCoverageThreshold: (m: number) => void;
  demandLayer: DemandLayer;
  onDemandLayer: (l: DemandLayer) => void;
}

/** The one setting a few lenses need, shown beside the legend that explains it. */
export default function LensOptions(p: Props) {
  if (p.overlay === 'traveltime') {
    return <Seg label="Destination" items={TRAVEL_DESTS} active={p.travelDest} onPick={p.onTravelDest} />;
  }
  if (p.overlay === 'demand') {
    return <Seg label="Demand layer" items={DEMAND_LAYERS} active={p.demandLayer} onPick={p.onDemandLayer} />;
  }
  if (p.overlay === 'coverage') {
    return (
      <Seg
        label="Walking distance"
        items={WALK_STEPS.map((m) => ({ key: String(m), label: `${m} m` }))}
        active={String(p.coverageThreshold)}
        onPick={(k) => p.onCoverageThreshold(Number(k))}
      />
    );
  }
  return null;
}
