import type { Theme } from '../../rendering/palette.ts';

const KEY = 'transitforge.theme';

/** The choice the person made, if they made one. Absent means "follow the system". */
export function savedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Storage can be blocked; the choice then lasts for this visit only.
  }
}

export function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Tokens, form controls and scrollbars all key off this one attribute. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}
