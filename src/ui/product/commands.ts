// Command palette registry. Commands are data here; the shell maps ids to
// real handlers, so this module stays UI-framework-free and fully testable.
export interface CommandDef {
  id: string;
  title: string;
  section: 'Mode' | 'Simulation' | 'View' | 'Scenario' | 'Help';
  shortcut?: string;
  keywords: string;
}

export function builtinCommands(): CommandDef[] {
  return [
    { id: 'mode-simulate', title: 'Open Simulate mode', section: 'Mode', shortcut: 'Esc', keywords: 'run watch observe' },
    { id: 'mode-build', title: 'Open Build mode', section: 'Mode', shortcut: 'B', keywords: 'edit construct metro bus station road' },
    { id: 'mode-disrupt', title: 'Open Disrupt mode', section: 'Mode', shortcut: 'D', keywords: 'incident closure break test resilience' },
    { id: 'mode-plan', title: 'Open Planning', section: 'Mode', shortcut: 'P', keywords: 'objectives brief evaluate submit' },
    { id: 'sim-play-pause', title: 'Play / pause simulation', section: 'Simulation', shortcut: 'Space', keywords: 'start stop run clock' },
    { id: 'sim-speed-1', title: 'Speed 1×', section: 'Simulation', shortcut: '1', keywords: 'slow' },
    { id: 'sim-speed-5', title: 'Speed 5×', section: 'Simulation', shortcut: '2', keywords: 'medium' },
    { id: 'sim-speed-20', title: 'Speed 20×', section: 'Simulation', shortcut: '3', keywords: 'fast' },
    { id: 'sim-reset', title: 'Reset the simulated day', section: 'Simulation', shortcut: 'R', keywords: 'restart morning' },
    { id: 'view-panel', title: 'Toggle side panel', section: 'View', shortcut: '[', keywords: 'rail sidebar hide show' },
    { id: 'view-analytics', title: 'Cycle analytics overlay', section: 'View', shortcut: 'A', keywords: 'access heatmap travel coverage' },
    { id: 'scenario-browser', title: 'Open scenario browser', section: 'Scenario', shortcut: 'O', keywords: 'saves load library demos projects' },
    { id: 'scenario-save', title: 'Save scenario', section: 'Scenario', shortcut: 'Ctrl+S', keywords: 'store persist autosave' },
    { id: 'scenario-export', title: 'Export scenario file', section: 'Scenario', keywords: 'download json share backup' },
    { id: 'scenario-import', title: 'Import scenario file', section: 'Scenario', keywords: 'upload open file restore' },
    { id: 'help-tutorial', title: 'Start guided tutorial', section: 'Help', keywords: 'tour learn howto' },
    { id: 'help-shortcuts', title: 'Show keyboard shortcuts', section: 'Help', shortcut: '?', keywords: 'keys hotkeys help' },
    { id: 'help-settings', title: 'Open settings', section: 'Help', keywords: 'preferences options configure' },
  ];
}

/** Subsequence fuzzy match scored for ranking (case-insensitive). */
export function matchScore(haystack: string, needle: string): number {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase().trim();
  if (n.length === 0) return 1;
  let hi = 0;
  let score = 0;
  let streak = 0;
  for (let ni = 0; ni < n.length; ni++) {
    const found = h.indexOf(n[ni], hi);
    if (found < 0) return 0;
    if (found === hi) {
      streak++;
      score += 2 + streak;
    } else {
      streak = 0;
      score += 1;
    }
    // Prefer matches at word starts.
    if (found === 0 || h[found - 1] === ' ') score += 2;
    hi = found + 1;
  }
  return score;
}

export function filterCommands(cmds: CommandDef[], query: string): CommandDef[] {
  const q = query.trim();
  if (!q) return cmds;
  return cmds
    .map((c) => ({ c, s: Math.max(matchScore(c.title, q), matchScore(`${c.title} ${c.keywords}`, q)) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
}
