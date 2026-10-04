import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings, settingsToDom } from '../../ui/product/settings.ts';
import {
  IDLE_ONBOARDING,
  ONBOARDING_STEPS,
  loadOnboardingDone,
  onboardingReducer,
} from '../../ui/product/onboarding.ts';
import { IDLE_TUTORIAL, TUTORIAL_STEPS, tutorialDone, tutorialReducer } from '../../ui/product/tutorial.ts';
import { builtinCommands, filterCommands } from '../../ui/product/commands.ts';

describe('settings', () => {
  it('keeps defaults and drops invalid values', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ uiScale: 'huge', defaultSpeed: 99, autosave: 'yes' })).toEqual(DEFAULT_SETTINGS);
    const s = sanitizeSettings({ uiScale: 'compact', motion: 'reduced', highContrast: true, defaultSpeed: 5, showBuildings: false, autosave: false });
    expect(s).toEqual({ uiScale: 'compact', motion: 'reduced', highContrast: true, defaultSpeed: 5, showBuildings: false, autosave: false });
  });

  it('maps settings to shell attributes', () => {
    expect(settingsToDom(DEFAULT_SETTINGS)).toEqual({ uiScale: 'comfortable', motion: 'system', contrast: 'normal' });
    expect(settingsToDom({ ...DEFAULT_SETTINGS, highContrast: true }).contrast).toBe('high');
  });
});

describe('onboarding machine', () => {
  it('walks six steps and finishes, skips cleanly', () => {
    expect(ONBOARDING_STEPS.length).toBe(6);
    let s = onboardingReducer(IDLE_ONBOARDING, { type: 'start' });
    for (let i = 0; i < 5; i++) {
      s = onboardingReducer(s, { type: 'next' });
      expect(s.active).toBe(true);
    }
    s = onboardingReducer(s, { type: 'next' });
    expect(s).toEqual({ active: false, index: 0, done: true });
    expect(onboardingReducer(IDLE_ONBOARDING, { type: 'next' })).toEqual(IDLE_ONBOARDING);
    expect(onboardingReducer({ ...IDLE_ONBOARDING, active: true }, { type: 'skip' }).done).toBe(true);
  });

  it('reads completion without throwing when storage is unavailable', () => {
    expect(typeof loadOnboardingDone()).toBe('boolean');
  });
});

describe('tutorial machine', () => {
  it('starts, pauses, resumes, exits, and finishes on the last step', () => {
    let s = tutorialReducer(IDLE_TUTORIAL, { type: 'start' });
    expect(s.active).toBe(true);
    s = tutorialReducer(s, { type: 'pause' });
    expect(tutorialReducer(s, { type: 'next' })).toEqual(s);
    s = tutorialReducer(s, { type: 'resume' });
    s = tutorialReducer(s, { type: 'back' });
    expect(s.index).toBe(0);
    for (let i = 0; i < TUTORIAL_STEPS.length; i++) s = tutorialReducer(s, { type: 'next' });
    expect(s).toEqual({ active: false, index: 0, paused: false, finished: true });
    expect(tutorialReducer(IDLE_TUTORIAL, { type: 'exit' })).toEqual(IDLE_TUTORIAL);
  });

  it('detects observable completion conditions', () => {
    const f = { mode: 'simulate', playing: false, overlay: 'normal', editCount: 0 };
    expect(tutorialDone('build-mode', { ...f, mode: 'build' })).toBe(true);
    expect(tutorialDone('playing', { ...f, playing: true })).toBe(true);
    expect(tutorialDone('analytics', { ...f, overlay: 'accessibility' })).toBe(true);
    expect(tutorialDone('analytics', f)).toBe(false);
    expect(tutorialDone('plan-mode', { ...f, mode: 'plan' })).toBe(true);
    expect(tutorialDone('edited', { ...f, editCount: 2 })).toBe(true);
  });
});

describe('command palette', () => {
  it('registers unique command ids', () => {
    const cmds = builtinCommands();
    expect(cmds.length).toBeGreaterThan(10);
    expect(new Set(cmds.map((c) => c.id)).size).toBe(cmds.length);
  });

  it('filters with empty query and fuzzy matches', () => {
    const cmds = builtinCommands();
    expect(filterCommands(cmds, '')).toHaveLength(cmds.length);
    expect(filterCommands(cmds, 'xyzzy-nothing')).toHaveLength(0);
    const top = filterCommands(cmds, 'save')[0];
    expect(top.id).toBe('scenario-save');
    expect(filterCommands(cmds, 'resilience')[0].id).toBe('mode-disrupt');
  });
});
