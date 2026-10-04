import { useRef } from 'react';
import SceneView, {
  type AnalyticsView,
  type BuildInteractions,
  type CatchmentView,
  type DraftView,
  type HoverInfo,
  type Layers,
  type MeasureView,
  type Overlay,
  type Selection,
} from '../../rendering/SceneView.tsx';
import type { CameraCmd } from '../../rendering/map/camera.ts';
import type { CameraInfo } from '../../rendering/SceneView.tsx';
import type { MapMarker } from '../../rendering/map/markers.ts';
import type { SimulationState } from '../../simulation/index.ts';

export interface SplitViewProps {
  baseSim: SimulationState;
  scenarioRef: React.RefObject<SimulationState>;
  layers: Layers;
  overlay: Overlay;
  selection: Selection | null;
  onSelect: (sel: Selection | null) => void;
  networkKey: number;
  build: BuildInteractions | null;
  analytics: AnalyticsView | null;
  draft: DraftView | null;
  cameraCmd: CameraCmd | null;
  onCamera: (info: CameraInfo) => void;
  onHoverObject: (h: HoverInfo | null) => void;
  onContextPick: (sel: Selection, x: number, y: number) => void;
  problemMarkers: MapMarker[];
  changeMarkers: MapMarker[];
  catchment: CatchmentView | null;
  measure: MeasureView | null;
  onClose: () => void;
}

/**
 * Before/after comparison (§24): baseline left, scenario right, one shared
 * camera command stream. The base pane renders a static (unstepped) sim, so
 * infrastructure differences are directly comparable.
 */
export default function CompareSplit(p: SplitViewProps) {
  const baseRef = useRef<SimulationState>(p.baseSim);
  baseRef.current = p.baseSim;
  const noopDraft = null;
  return (
    <div className="tf-split">
      <div className="tf-split-pane">
        <div className="tf-split-label">Baseline</div>
        <SceneView
          simRef={baseRef}
          layers={p.layers}
          overlay={p.overlay}
          selection={p.selection}
          onSelect={p.onSelect}
          networkKey={p.networkKey}
          ghosts={[]}
          highlightRoutes={[]}
          build={null}
          draft={noopDraft}
          analytics={null}
          cameraCmd={p.cameraCmd}
          onCamera={null}
          onHoverObject={p.onHoverObject}
          onContextPick={p.onContextPick}
          problemMarkers={[]}
          changeMarkers={[]}
          catchment={null}
          measure={null}
          measureActive={false}
          onMeasurePoint={null}
          onMeasureHover={null}
        />
      </div>
      <div className="tf-split-pane">
        <div className="tf-split-label">Scenario</div>
        <SceneView
          simRef={p.scenarioRef}
          layers={p.layers}
          overlay={p.overlay}
          selection={p.selection}
          onSelect={p.onSelect}
          networkKey={p.networkKey}
          ghosts={[]}
          highlightRoutes={[]}
          build={p.build}
          draft={p.draft}
          analytics={p.analytics}
          cameraCmd={p.cameraCmd}
          onCamera={p.onCamera}
          onHoverObject={p.onHoverObject}
          onContextPick={p.onContextPick}
          problemMarkers={p.problemMarkers}
          changeMarkers={p.changeMarkers}
          catchment={p.catchment}
          measure={p.measure}
          measureActive={false}
          onMeasurePoint={null}
          onMeasureHover={null}
        />
      </div>
      <button type="button" className="tf-btn small tf-split-close" onClick={p.onClose}>
        Exit split view
      </button>
    </div>
  );
}
