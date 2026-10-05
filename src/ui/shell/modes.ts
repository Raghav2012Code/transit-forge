import { IconBuild, IconDisrupt, IconPlan, IconSimulate } from './icons.tsx';

export type AppMode = 'simulate' | 'build' | 'disrupt' | 'plan';

export interface ModeInfo {
  key: AppMode;
  /** The name on the rail and in the command palette. */
  label: string;
  hotkey: string;
  icon: typeof IconSimulate;
  /** One plain sentence: what you do here. */
  blurb: string;
}

export const MODES: readonly ModeInfo[] = [
  { key: 'simulate', label: 'Simulate', hotkey: 'Space', icon: IconSimulate, blurb: 'Watch the day run and read the network.' },
  { key: 'build', label: 'Build', hotkey: 'B', icon: IconBuild, blurb: 'Draw lines, stations and roads. The clock pauses.' },
  { key: 'disrupt', label: 'Disrupt', hotkey: 'D', icon: IconDisrupt, blurb: 'Break something and see how the network copes.' },
  { key: 'plan', label: 'Plan', hotkey: 'P', icon: IconPlan, blurb: 'Pick a brief, build against it, then submit.' },
];

export const MODE_LABEL: Record<AppMode, string> = {
  simulate: 'Simulate',
  build: 'Build',
  disrupt: 'Disrupt',
  plan: 'Plan',
};
