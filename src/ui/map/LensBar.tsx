import type { ReactNode } from 'react';
import type { Layers, Overlay } from '../../rendering/SceneView.tsx';
import LayerToggles from '../controls/LayerToggles.tsx';
import LensMenu from '../controls/LensMenu.tsx';
import Seg from '../controls/Seg.tsx';
import { lensLabel, PRIMARY_LENSES } from '../controls/lenses.ts';
import { IconChevron, IconLayers } from '../shell/icons.tsx';
import Popover from '../shell/Popover.tsx';

interface Props {
  overlay: Overlay;
  onOverlay: (o: Overlay) => void;
  layers: Layers;
  onLayers: (l: Layers) => void;
  /** Rendered under the bar: the legend and any setting the lens needs. */
  children?: ReactNode;
}

/**
 * What the map is showing, in one row. The five lenses worth a click are
 * always there; the rest sit under "More", which names the lens you picked
 * so the row never hides what is on.
 */
export default function LensBar({ overlay, onOverlay, layers, onLayers, children }: Props) {
  const hidden = !PRIMARY_LENSES.includes(overlay);
  return (
    <div className="tf-lens">
      <div className="tf-lens-row">
        <Seg
          label="Map lens"
          items={PRIMARY_LENSES.map((k) => ({ key: k, label: lensLabel(k) }))}
          active={overlay}
          onPick={onOverlay}
          wrap={false}
          bare
          className="tf-lens-seg"
        />
        <Popover
          label="All lenses"
          trigger={(props, open) => (
            <button type="button" className={`tf-lens-btn${hidden ? ' active' : ''}${open ? ' open' : ''}`} {...props}>
              <span>{hidden ? lensLabel(overlay) : 'More'}</span>
              <IconChevron className="tf-caret" />
            </button>
          )}
        >
          {(close) => (
            <LensMenu
              overlay={overlay}
              onPick={(o) => {
                onOverlay(o);
                close();
              }}
            />
          )}
        </Popover>
        <Popover
          label="Layers"
          trigger={(props, open) => (
            <button type="button" className={`tf-lens-btn${open ? ' open' : ''}`} {...props}>
              <IconLayers />
              <span>Layers</span>
            </button>
          )}
        >
          <LayerToggles layers={layers} onChange={onLayers} />
        </Popover>
      </div>
      {children}
    </div>
  );
}
