// Interactive tutorial: a small state machine over real-app steps.
// Steps never fake the app — each `doneWhen` key names observable UI state
// the shell already has (mode, playback, overlay, edit count). Advancement
// is always available via Next/Skip so the tutorial can never trap the user.
export type TutorialDoneKey = 'build-mode' | 'playing' | 'analytics' | 'plan-mode' | 'edited';

export interface TutorialStep {
  id: string;
  title: string;
  body: string;
  /** data-tour attribute to highlight, or null for a centered card. */
  target: string | null;
  /** Observable condition that auto-completes the step (null = manual Next). */
  doneWhen: TutorialDoneKey | null;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to TransitForge',
    body: 'This is a living fictional city. In the next minute you will build something, run the simulation, and read the results — on the real app, nothing is staged.',
    target: null,
    doneWhen: null,
  },
  {
    id: 'build-mode',
    title: 'Enter Build mode',
    body: 'Build mode pauses the clock so you can edit the network. Click Build in the mode switch.',
    target: 'mode-build',
    doneWhen: 'build-mode',
  },
  {
    id: 'tools',
    title: 'Pick the Metro tool',
    body: 'Metro is already selected. Click two stations on the map to draft a line — or just press Next to watch the next step.',
    target: 'build-tools',
    doneWhen: 'edited',
  },
  {
    id: 'run',
    title: 'Run the simulation',
    body: 'Press Play (or Space). The clock advances one minute per tick and passengers start moving.',
    target: 'sim-play',
    doneWhen: 'playing',
  },
  {
    id: 'analytics',
    title: 'Read an analytics overlay',
    body: 'Overlays turn the city into a readable diagram. Open any access-analytics overlay to see the numbers behind the map.',
    target: 'overlays',
    doneWhen: 'analytics',
  },
  {
    id: 'plan',
    title: 'Open Planning',
    body: 'Planning turns observations into objectives: pick a brief, build toward it, and submit for a real simulated evaluation.',
    target: 'mode-plan',
    doneWhen: 'plan-mode',
  },
  {
    id: 'done',
    title: 'You are a planner now',
    body: 'That is the whole loop: observe, build, simulate, evaluate. Reopen this tour any time from Settings. Press Finish to keep exploring.',
    target: null,
    doneWhen: null,
  },
];

export interface TutorialState {
  active: boolean;
  index: number;
  paused: boolean;
  finished: boolean;
}

export const IDLE_TUTORIAL: TutorialState = { active: false, index: 0, paused: false, finished: false };

export type TutorialEvent =
  | { type: 'start' }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'skip' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'exit' }
  | { type: 'auto-advance' };

export function tutorialReducer(s: TutorialState, e: TutorialEvent): TutorialState {
  switch (e.type) {
    case 'start':
      return { active: true, index: 0, paused: false, finished: false };
    case 'exit':
      return { ...IDLE_TUTORIAL };
    case 'pause':
      return s.active ? { ...s, paused: true } : s;
    case 'resume':
      return s.active ? { ...s, paused: false } : s;
    case 'back':
      return s.active && !s.paused ? { ...s, index: Math.max(0, s.index - 1) } : s;
    case 'next':
    case 'skip':
    case 'auto-advance': {
      if (!s.active || s.paused) return s;
      if (s.index >= TUTORIAL_STEPS.length - 1) return { ...IDLE_TUTORIAL, finished: true };
      return { ...s, index: s.index + 1 };
    }
  }
}

/** Observable app facts the shell feeds the auto-advance check. */
export interface TutorialFacts {
  mode: string;
  playing: boolean;
  overlay: string;
  editCount: number;
}

const ANALYTICS_OVERLAYS = new Set([
  'accessibility', 'traveltime', 'coverage', 'bottlenecks', 'critical',
  'congestion', 'popdensity', 'jobdensity', 'development', 'growth', 'demand',
]);

export function tutorialDone(key: TutorialDoneKey, f: TutorialFacts): boolean {
  switch (key) {
    case 'build-mode': return f.mode === 'build';
    case 'playing': return f.playing;
    case 'analytics': return ANALYTICS_OVERLAYS.has(f.overlay);
    case 'plan-mode': return f.mode === 'plan';
    case 'edited': return f.editCount > 0;
  }
}
