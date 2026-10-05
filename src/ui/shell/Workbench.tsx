import type { BuildTool } from '../build/BuildPanel.tsx';
import {
  IconBus,
  IconExtend,
  IconInspect,
  IconMeasure,
  IconMetro,
  IconRoad,
  IconStationPin,
  IconTrash,
} from './icons.tsx';
import { MODES, type AppMode } from './modes.ts';

interface Props {
  mode: AppMode;
  onMode: (m: AppMode) => void;
  tool: BuildTool;
  onTool: (t: BuildTool) => void;
  measureOn: boolean;
  onMeasure: () => void;
  inspectOn: boolean;
  onInspect: () => void;
}

const BUILD_TOOLS: { key: BuildTool; label: string; title: string; icon: typeof IconMetro }[] = [
  { key: 'metro', label: 'Metro', title: 'Draw a metro line through stations', icon: IconMetro },
  { key: 'station', label: 'Station', title: 'Place a new station', icon: IconStationPin },
  { key: 'bus', label: 'Bus', title: 'Draw a bus route through stations', icon: IconBus },
  { key: 'road', label: 'Road', title: 'Draw a road', icon: IconRoad },
  { key: 'extend', label: 'Extend', title: 'Add stations to the end of a route', icon: IconExtend },
  { key: 'delete', label: 'Delete', title: 'Remove a station, route or road', icon: IconTrash },
];

/**
 * The left rail: what you are doing (the mode), then the tools that mode
 * gives you, then the two map tools that work everywhere. Every item carries
 * its name, because an icon alone is a guess.
 */
export default function Workbench({ mode, onMode, tool, onTool, measureOn, onMeasure, inspectOn, onInspect }: Props) {
  return (
    <nav className="tf-rail" aria-label="Workspace">
      <div className="tf-rail-group" role="radiogroup" aria-label="Mode">
        {MODES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={mode === m.key}
              className="tf-rail-item"
              onClick={() => onMode(m.key)}
              title={`${m.label} (${m.hotkey}). ${m.blurb}`}
              data-mode={m.key}
            >
              <Icon />
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      {mode === 'build' && (
        <div className="tf-rail-group" role="radiogroup" aria-label="Build tool">
          {BUILD_TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={tool === t.key}
                className="tf-rail-item tool"
                onClick={() => onTool(t.key)}
                title={t.title}
              >
                <Icon />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="tf-rail-group end" role="group" aria-label="Map tools">
        {mode === 'build' && (
          <button
            type="button"
            className="tf-rail-item tool"
            aria-pressed={inspectOn}
            onClick={onInspect}
            title="Quick inspect (I): clicking selects instead of building"
          >
            <IconInspect />
            <span>Inspect</span>
          </button>
        )}
        <button
          type="button"
          className="tf-rail-item tool"
          aria-pressed={measureOn}
          onClick={onMeasure}
          title="Measure a distance (M)"
        >
          <IconMeasure />
          <span>Measure</span>
        </button>
      </div>
    </nav>
  );
}
