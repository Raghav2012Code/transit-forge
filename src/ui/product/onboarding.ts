// First-run onboarding: six conceptual cards over the live app, small enough
// to finish in about a minute. Completion persists; Settings restarts it.
export interface OnboardingStep {
  id: string;
  title: string;
  body: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'city',
    title: 'Meet your city',
    body: 'A fictional coastal city with ten districts, three road classes, and six transit lines. Everything you see is simulated — nothing is a picture.',
  },
  {
    id: 'demand',
    title: 'Understand demand',
    body: 'Citizens generate travel demand all day: work, school, shopping, flights. Flows concentrate on a few corridors — those are your opportunities.',
  },
  {
    id: 'build',
    title: 'Build',
    body: 'Build mode pauses the clock. Add stations, draw metro and bus lines, extend routes, tune frequencies and fares.',
  },
  {
    id: 'simulate',
    title: 'Simulate',
    body: 'Press Play and the clock runs: vehicles move, passengers board, cars jam the arterials. Cause, then effect.',
  },
  {
    id: 'analyze',
    title: 'Analyze',
    body: 'Overlays turn the map into evidence: accessibility, congestion, crowding, utilization, growth. Trust the numbers, not your eyes.',
  },
  {
    id: 'plan',
    title: 'Plan',
    body: 'Pick a planning brief with objectives and constraints, build toward it, and submit for a real simulated evaluation with a verdict.',
  },
];

export interface OnboardingState {
  active: boolean;
  index: number;
  done: boolean;
}

export const IDLE_ONBOARDING: OnboardingState = { active: false, index: 0, done: false };

export type OnboardingEvent = { type: 'start' } | { type: 'next' } | { type: 'back' } | { type: 'skip' } | { type: 'finish' };

export function onboardingReducer(s: OnboardingState, e: OnboardingEvent): OnboardingState {
  switch (e.type) {
    case 'start':
      return { active: true, index: 0, done: false };
    case 'back':
      return s.active ? { ...s, index: Math.max(0, s.index - 1) } : s;
    case 'next':
      if (!s.active) return s;
      return s.index >= ONBOARDING_STEPS.length - 1
        ? { active: false, index: 0, done: true }
        : { ...s, index: s.index + 1 };
    case 'skip':
    case 'finish':
      return s.active ? { active: false, index: 0, done: true } : s;
  }
}

const KEY = 'transitforge.onboarding.v1';

export function loadOnboardingDone(): boolean {
  try {
    return localStorage.getItem(KEY) === 'done';
  } catch {
    return false;
  }
}

export function saveOnboardingDone(): void {
  try {
    localStorage.setItem(KEY, 'done');
  } catch {
    // Unavailable: onboarding may reappear next launch.
  }
}

export function clearOnboardingDone(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Ignore.
  }
}
