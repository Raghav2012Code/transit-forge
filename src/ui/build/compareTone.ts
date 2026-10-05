import type { CompareRow } from '../../simulation/scenario/compare.ts';

export function compareTone(r: CompareRow): '' | 'tf-good' | 'tf-bad' {
  const good = r.better && r.pct !== null && r.pct !== 0 &&
    ((r.better === 'down' && r.pct < 0) || (r.better === 'up' && r.pct > 0));
  if (good) return 'tf-good';
  const bad = r.better && r.pct !== null && r.pct !== 0 && !good;
  return bad ? 'tf-bad' : '';
}
