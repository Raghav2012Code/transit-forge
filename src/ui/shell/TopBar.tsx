import type { ReactNode } from 'react';
import type { Theme } from '../../rendering/palette.ts';
import { IconChevron, IconHelp, IconMoon, IconPanel, IconPlan, IconScenario, IconSearch, IconSun } from './icons.tsx';
import Popover from './Popover.tsx';

interface Props {
  scenarioName: string;
  edits: number;
  /** The saved-scenarios surface, shown in the scenario popover. */
  scenarioMenu: ReactNode;
  onSearch: () => void;
  theme: Theme;
  onTheme: () => void;
  onHelp: () => void;
  panelOpen: boolean;
  onPanel: () => void;
}

/**
 * The masthead does three jobs and no more: say what you are working on,
 * find anything, and hold the two settings nobody reaches for often.
 */
export default function TopBar({ scenarioName, edits, scenarioMenu, onSearch, theme, onTheme, onHelp, panelOpen, onPanel }: Props) {
  return (
    <header className="tf-bar">
      <div className="tf-bar-left">
        <div className="tf-brand">
          <span className="tf-brand-mark" aria-hidden="true">
            <IconPlan size={17} />
          </span>
          <span className="tf-brand-name"><b>TransitForge</b></span>
        </div>
        <Popover
          label="Scenario"
          className="tf-scenario-pop"
          trigger={(props, open) => (
            <button type="button" className={`tf-scenario-chip${open ? ' open' : ''}`} {...props}>
              <IconScenario />
              <span className="tf-scenario-name">{scenarioName}</span>
              <span className="tf-scenario-edits">{edits === 0 ? 'No edits' : `${edits} ${edits === 1 ? 'edit' : 'edits'}`}</span>
              <IconChevron className="tf-caret" />
            </button>
          )}
        >
          {scenarioMenu}
        </Popover>
      </div>

      <button type="button" className="tf-command" onClick={onSearch} aria-label="Search the map or run a command">
        <IconSearch />
        <span>Search the map or run a command</span>
        <kbd>/</kbd>
      </button>

      <div className="tf-bar-right">
        <button
          type="button"
          className="tf-btn icon ghost"
          onClick={onTheme}
          title={theme === 'dark' ? 'Switch to light theme (T)' : 'Switch to dark theme (T)'}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
        <button
          type="button"
          className="tf-btn icon ghost"
          aria-pressed={panelOpen}
          onClick={onPanel}
          title={panelOpen ? 'Hide the side panel ([)' : 'Show the side panel (])'}
          aria-label="Side panel"
        >
          <IconPanel />
        </button>
        <button type="button" className="tf-btn icon ghost" onClick={onHelp} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">
          <IconHelp />
        </button>
      </div>
    </header>
  );
}
