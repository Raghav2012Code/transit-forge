import { useMemo } from 'react';
import { cameraWedge, frameFor, project } from '../../rendering/map/minimap.ts';
import type { CameraInfo, Selection } from '../../rendering/SceneView.tsx';
import type { CityData, Station, TransportRoute } from '../../types/index.ts';

interface Props {
  city: CityData;
  routes: TransportRoute[];
  stations: Station[];
  cam: CameraInfo | null;
  selection: Selection | null;
  /** Jump the main camera target to a world point (keeps distance). */
  onJump: (x: number, z: number) => void;
}

const W = 172;
const H = 128;

/** Lightweight SVG minimap: boundary, river, roads, lines, wedge. No WebGL. */
export default function Minimap({ city, routes, stations, cam, selection, onJump }: Props) {
  const frame = useMemo(() => {
    const pts = [
      ...city.zones.map((z) => ({ x: z.center.x, z: z.center.z })),
      ...city.river.map((p) => ({ x: p.x, z: p.z })),
    ];
    return frameFor(pts, W, H);
  }, [city]);
  const byId = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations]);
  const nodeById = useMemo(() => new Map(city.roadNodes.map((n) => [n.id, n.pos])), [city]);
  const wedge = cam
    ? cameraWedge(frame, { x: cam.pos[0], z: cam.pos[2] }, { x: cam.target[0], z: cam.target[2] }, cam.dist)
    : null;
  const selDot = (() => {
    if (!selection) return null;
    if (selection.kind === 'station') {
      const st = byId.get(selection.id);
      return st ? project(frame, st.pos.x, st.pos.z) : null;
    }
    if (selection.kind === 'zone') {
      const z = city.zones.find((zz) => zz.id === selection.id);
      return z ? project(frame, z.center.x, z.center.z) : null;
    }
    return null;
  })();

  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * W;
    const sy = ((e.clientY - rect.top) / rect.height) * H;
    const spanX = frame.maxX - frame.minX;
    const spanZ = frame.maxZ - frame.minZ;
    onJump(frame.minX + (sx / W) * spanX, frame.minZ + (sy / H) * spanZ);
  };

  // Keyboard equivalent of clicking a point: arrow keys nudge the camera
  // target from where it currently is; Enter/Space jumps to the map centre.
  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const step = Math.max(frame.maxX - frame.minX, frame.maxZ - frame.minZ) * 0.08;
    const cx = cam ? cam.target[0] : (frame.minX + frame.maxX) / 2;
    const cz = cam ? cam.target[2] : (frame.minZ + frame.maxZ) / 2;
    switch (e.key) {
      case 'ArrowUp': onJump(cx, cz - step); break;
      case 'ArrowDown': onJump(cx, cz + step); break;
      case 'ArrowLeft': onJump(cx - step, cz); break;
      case 'ArrowRight': onJump(cx + step, cz); break;
      case 'Enter':
      case ' ':
        onJump((frame.minX + frame.maxX) / 2, (frame.minZ + frame.maxZ) / 2);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  return (
    <div className="tf-minimap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        onClick={onClick}
        onKeyDown={onKeyDown}
        role="button"
        tabIndex={0}
        aria-label="Minimap. Click or use arrow keys to move the camera, Enter to centre."
        style={{ cursor: 'crosshair', display: 'block' }}
      >
        <rect x={0} y={0} width={W} height={H} fill="var(--plate)" />
        {/* river */}
        <polyline
          points={city.river.map((p) => project(frame, p.x, p.z).join(',')).join(' ')}
          fill="none"
          stroke="var(--mm-river)"
          strokeWidth={3}
        />
        {/* roads: arterials brighter */}
        {city.roadEdges.map((e) => {
          const a = nodeById.get(e.a);
          const b = nodeById.get(e.b);
          if (!a || !b) return null;
          const [x1, y1] = project(frame, a.x, a.z);
          const [x2, y2] = project(frame, b.x, b.z);
          return (
            <line
              key={e.id}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={e.isArterial ? 'var(--mm-arterial)' : 'var(--mm-road)'}
              strokeWidth={e.isArterial ? 1.4 : 0.7}
            />
          );
        })}
        {/* districts */}
        {city.zones.map((z) => {
          const [cx, cy] = project(frame, z.center.x, z.center.z);
          return <circle key={z.id} cx={cx} cy={cy} r={2.4} fill="none" stroke="var(--mm-zone)" strokeWidth={0.8}>
            <title>{z.name}</title>
          </circle>;
        })}
        {/* transit lines */}
        {routes.map((r) => {
          const pts = r.stationIds
            .map((id) => byId.get(id))
            .filter((s): s is Station => Boolean(s))
            .map((s) => project(frame, s.pos.x, s.pos.z).join(','))
            .join(' ');
          if (!pts) return null;
          return <polyline key={r.id} points={pts} fill="none" stroke={r.color} strokeWidth={1.6}><title>{r.name}</title></polyline>;
        })}
        {/* stations */}
        {stations.map((s) => {
          const [cx, cy] = project(frame, s.pos.x, s.pos.z);
          return <circle key={s.id} cx={cx} cy={cy} r={1.3} fill="var(--mm-station)"><title>{s.name}</title></circle>;
        })}
        {/* camera wedge */}
        {wedge && (
          <polygon points={wedge.map((p) => p.join(',')).join(' ')} fill="var(--mm-wedge-fill)" stroke="var(--mm-wedge)" strokeWidth={0.8} />
        )}
        {selDot && <circle cx={selDot[0]} cy={selDot[1]} r={3} fill="none" stroke="var(--mm-selected)" strokeWidth={1.4} />}
      </svg>
    </div>
  );
}
