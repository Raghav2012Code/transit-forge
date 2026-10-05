// Series colour follows the design rule: colour only means a line or a
// condition. A plain series is ink; a second series on the same subject is
// told apart by weight and dash, not hue; a reading that is good or bad takes
// the status colour.
export const SERIES = {
  primary: 'var(--ink-strong)',
  secondary: 'var(--ink-faint)',
  good: 'var(--ok)',
  bad: 'var(--alert)',
} as const;
