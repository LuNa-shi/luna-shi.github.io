import { describe, expect, it } from 'vitest';

import type { TecPlan } from './tec-schedule';
import { scheduleTecTasks } from './tec-schedule';

describe('TEC proof schedules', () => {
  it('separates fixed-plan scheduling from replacing the work', () => {
    expect(scheduleTecTasks('fork', 1)).toMatchObject({ duration: 9, work: 9, span: 7 });
    for (let workers = 1; workers <= 6; workers++) {
      expect(scheduleTecTasks('chain', workers)).toMatchObject({ duration: 9, work: 9, span: 9 });
      expect(scheduleTecTasks('lookup', workers)).toMatchObject({ duration: 3, work: 3, span: 3 });
      if (workers > 1) {
        const result = scheduleTecTasks('fork', workers);
        expect(result).toMatchObject({ duration: 7, work: 9, span: 7 });
        expect(result.tasks.find((task) => task.id === 3)?.start).toBe(5);
        expect(result.tasks.filter((task) => task.start === 1).map((task) => task.id)).toEqual([
          1, 2,
        ]);
      }
    }
  });
  it('keeps workers exclusive and waits for all prerequisite operations', () => {
    for (const plan of ['chain', 'fork', 'lookup'] as TecPlan[]) {
      const deps =
        plan === 'lookup'
          ? [[5, 4]]
          : plan === 'chain'
            ? [
                [0, 1],
                [1, 2],
                [2, 3],
                [3, 4],
              ]
            : [
                [0, 1],
                [0, 2],
                [1, 3],
                [2, 3],
                [3, 4],
              ];
      for (let workers = 1; workers <= 6; workers++) {
        const { tasks, duration, work, span } = scheduleTecTasks(plan, workers);
        for (const [before, after] of deps) {
          const a = tasks.find((t) => t.id === before)!;
          const b = tasks.find((t) => t.id === after)!;
          expect(a.start + a.duration).toBeLessThanOrEqual(b.start);
        }
        tasks.forEach((a, i) =>
          tasks.slice(i + 1).forEach((b) => {
            if (a.worker === b.worker)
              expect(a.start + a.duration <= b.start || b.start + b.duration <= a.start).toBe(true);
          }),
        );
        expect(duration).toBeGreaterThanOrEqual(Math.max(work / workers, span));
      }
    }
  });
});
