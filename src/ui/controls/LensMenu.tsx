import type { Overlay } from '../../rendering/SceneView.tsx';
import { LENS_GROUPS } from './lenses.ts';
import Seg from './Seg.tsx';

/** Every lens, grouped by the question it answers. Lives in the lens bar's "More" popover. */
export default function LensMenu({ overlay, onPick }: { overlay: Overlay; onPick: (o: Overlay) => void }) {
  return (
    <div className="tf-lens-menu">
      {LENS_GROUPS.map((g) => (
        <Seg key={g.title} label={g.title} items={g.items} active={overlay} onPick={onPick} />
      ))}
    </div>
  );
}
