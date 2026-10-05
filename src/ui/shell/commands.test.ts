import { describe, expect, it } from 'vitest';
import { rankCommands, type Command } from './commands.ts';

const cmd = (id: string, label: string, extra: Partial<Command> = {}): Command => ({
  id,
  label,
  group: 'Test',
  run: () => {},
  ...extra,
});

const COMMANDS: Command[] = [
  cmd('sim', 'Go to Simulate', { suggested: true }),
  cmd('build', 'Go to Build', { suggested: true }),
  cmd('dark', 'Switch to dark theme', { suggested: true, keywords: 'night mode appearance' }),
  cmd('light', 'Switch to light theme', { keywords: 'day mode appearance' }),
  cmd('reports', 'Open reports', { keywords: 'tables numbers statistics' }),
  cmd('crowd', 'Show crowding lens', { keywords: 'overlay map' }),
];

describe('rankCommands', () => {
  it('offers only the suggested commands, in order, before anything is typed', () => {
    expect(rankCommands(COMMANDS, '').map((c) => c.id)).toEqual(['sim', 'build', 'dark']);
    expect(rankCommands(COMMANDS, '   ').map((c) => c.id)).toEqual(['sim', 'build', 'dark']);
  });

  it('matches the label by prefix, word start and substring', () => {
    expect(rankCommands(COMMANDS, 'go to b')[0].id).toBe('build');
    expect(rankCommands(COMMANDS, 'crowd')[0].id).toBe('crowd');
    expect(rankCommands(COMMANDS, 'theme').map((c) => c.id)).toEqual(expect.arrayContaining(['dark', 'light']));
  });

  it('ignores case', () => {
    expect(rankCommands(COMMANDS, 'DARK')[0].id).toBe('dark');
  });

  it('finds a command by a word only its keywords contain', () => {
    expect(rankCommands(COMMANDS, 'statistics')[0].id).toBe('reports');
    expect(rankCommands(COMMANDS, 'night')[0].id).toBe('dark');
  });

  it('ranks a label match above a keyword match', () => {
    const list = [cmd('a', 'Open appearance settings'), cmd('b', 'Switch theme', { keywords: 'appearance' })];
    expect(rankCommands(list, 'appearance')[0].id).toBe('a');
  });

  it('keeps declaration order for equal scores, so the list does not shuffle', () => {
    const ids = rankCommands(COMMANDS, 'switch').map((c) => c.id);
    expect(ids).toEqual(['dark', 'light']);
  });

  it('returns nothing for a query that matches nothing, and respects the limit', () => {
    expect(rankCommands(COMMANDS, 'zzzz')).toEqual([]);
    expect(rankCommands(COMMANDS, 'o', 2)).toHaveLength(2);
  });
});
