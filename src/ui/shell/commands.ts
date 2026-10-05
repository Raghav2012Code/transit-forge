// Commands for the palette: every action in the workspace, findable by typing.
// Pure data in, ranked rows out, so the ranking is testable without a browser.
import { scoreName } from '../../rendering/map/searchIndex.ts';

export interface Command {
  id: string;
  /** What it does, as a verb phrase: "Switch to dark theme". */
  label: string;
  /** Section it belongs to, shown on the row. */
  group: string;
  /** The shortcut, as keys people press. */
  keys?: string[];
  /** Words people might type that the label does not contain. */
  keywords?: string;
  /** Offered before anything is typed. */
  suggested?: boolean;
  run: () => void;
}

/**
 * A command's score for a query. Keywords are a fallback: capped below the
 * weakest label substring match (25), so a word the label really contains
 * always outranks one that only a keyword does.
 */
function scoreCommand(c: Command, q: string): number {
  const byLabel = scoreName(c.label, q);
  const byWords = c.keywords ? Math.min(20, Math.floor(scoreName(c.keywords, q) * 0.25)) : 0;
  return Math.max(byLabel, byWords);
}

/**
 * With nothing typed, the suggested commands in the order given. With a
 * query, the best matches first; ties keep the order they were declared in so
 * the list never shuffles between keystrokes.
 */
export function rankCommands(commands: Command[], query: string, limit = 6): Command[] {
  const q = query.trim();
  if (!q) return commands.filter((c) => c.suggested).slice(0, limit);
  return commands
    .map((c, i) => ({ c, i, score: scoreCommand(c, q) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, Math.max(1, limit))
    .map((r) => r.c);
}
