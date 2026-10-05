/** Keys as people read them. The handler is `onKey` in App.tsx; change both together. */
export interface ShortcutGroup {
  title: string;
  items: [keys: string[], does: string][];
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'The day',
    items: [
      [['Space'], 'Play or pause'],
      [['1', '2', '3'], 'Speed 1×, 5×, 20×'],
      [['R'], 'Reset the day'],
    ],
  },
  {
    title: 'Modes',
    items: [
      [['B'], 'Build'],
      [['D'], 'Disrupt'],
      [['P'], 'Plan'],
      [['Esc'], 'Back to Simulate'],
    ],
  },
  {
    title: 'The map',
    items: [
      [['/'], 'Search the map or run a command'],
      [['F'], 'Focus the selection'],
      [['0'], 'Reset the view'],
      [['A'], 'Accessibility lens on or off'],
      [['I'], 'Quick inspect while building'],
      [['M'], 'Measure a distance'],
    ],
  },
  {
    title: 'The workspace',
    items: [
      [['['], 'Hide the side panel'],
      [[']'], 'Show the side panel'],
      [['T'], 'Switch between light and dark'],
      [['?'], 'This list'],
    ],
  },
  {
    title: 'Editing',
    items: [
      [['Ctrl', 'Z'], 'Undo'],
      [['Ctrl', 'Shift', 'Z'], 'Redo'],
    ],
  },
];
