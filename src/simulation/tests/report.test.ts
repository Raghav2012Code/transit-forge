import { describe, expect, it } from 'vitest';
import { objectiveProgressPct } from '../planning/report.ts';

const obj = (progress: number) => ({ title: 't', value: 'v', target: '> 1', passed: false, progress });

describe('objectiveProgressPct', () => {
  it('averages every objective and rounds to a whole percent', () => {
    expect(objectiveProgressPct({ objectives: [obj(1), obj(0)] })).toBe(50);
    expect(objectiveProgressPct({ objectives: [obj(0.5), obj(0.25), obj(1)] })).toBe(58);
  });

  it('clamps progress outside 0..1 and handles an empty brief', () => {
    expect(objectiveProgressPct({ objectives: [obj(1.4), obj(-0.2)] })).toBe(50);
    expect(objectiveProgressPct({ objectives: [] })).toBe(0);
  });
});
