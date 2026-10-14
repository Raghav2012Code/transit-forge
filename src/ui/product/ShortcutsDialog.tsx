/** Every shortcut in one place — mirrors the App key handler exactly. */
export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Space', action: 'Play / pause simulation' },
  { keys: '1 / 2 / 3', action: 'Speed 1× / 5× / 20×' },
  { keys: 'B', action: 'Build mode' },
  { keys: 'D', action: 'Disrupt mode' },
  { keys: 'P', action: 'Planning mode' },
  { keys: 'A', action: 'Cycle analytics overlay' },
  { keys: 'O', action: 'Scenario browser' },
  { keys: 'Ctrl/⌘ + K', action: 'Command palette' },
  { keys: 'Ctrl/⌘ + S', action: 'Save scenario' },
  { keys: '[ / ]', action: 'Hide / show side panel' },
  { keys: '?', action: 'This shortcut list' },
  { keys: 'Esc', action: 'Close dialog / back to Simulate' },
  { keys: 'R', action: 'Reset the simulated day' },
];

export default function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="tf-modal-scrim" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="tf-modal">
        <div className="tf-inspector-head">
          <h2>Keyboard shortcuts</h2>
          <button type="button" className="tf-btn small" onClick={onClose}>Close</button>
        </div>
        <table className="tf-compare-table">
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys}>
                <td><kbd>{s.keys}</kbd></td>
                <td>{s.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
