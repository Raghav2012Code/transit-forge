import { IconBuild, IconDisrupt, IconPlan, IconSimulate } from './icons.tsx';

export type AppMode = 'simulate' | 'build' | 'disrupt' | 'plan';

const MODES: { key: AppMode; label: string; icon: typeof IconSimulate; hotkey: string }[] = [
  { key: 'simulate', label: 'Simulate', icon: IconSimulate, hotkey: 'Space' },
  { key: 'build', label: 'Build', icon: IconBuild, hotkey: 'B' },
  { key: 'disrupt', label: 'Disrupt', icon: IconDisrupt, hotkey: 'D' },
  { key: 'plan', label: 'Plan', icon: IconPlan, hotkey: 'P' },
];

interface Props {
  mode: AppMode;
  onChange: (m: AppMode) => void;
}

export default function ModeSwitch({ mode, onChange }: Props) {
  return (
    <div className="tf-seg" role="radiogroup" aria-label="Editor mode">
      {MODES.map((m) => {
        const Icon = m.icon;
        return (
          <button
            key={m.key}
            type="button"
            role="radio"
            aria-checked={mode === m.key}
            className="tf-seg-item wide"
            onClick={() => onChange(m.key)}
            title={`${m.label} (${m.hotkey})`}
          >
            <Icon />
            <span>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}