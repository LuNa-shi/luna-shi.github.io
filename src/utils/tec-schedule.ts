export type TecPlan = 'chain' | 'fork' | 'lookup';

/** Fixed operation costs for the article's explicitly normalized proof plans. */
export function scheduleTecTasks(structure: TecPlan, workers: number) {
  const available = Math.max(1, Math.min(6, Math.floor(workers)));
  const durations = structure === 'lookup' ? [2, 1] : [1, 2, 4, 1, 1];
  const ids = structure === 'lookup' ? [5, 4] : [0, 1, 2, 3, 4];
  const dependencies =
    structure === 'lookup'
      ? [[], [0]]
      : structure === 'chain'
        ? [[], [0], [1], [2], [3]]
        : [[], [0], [0], [1, 2], [3]];
  const completed = new Set<number>();
  const started = new Set<number>();
  const active: Array<{ index: number; worker: number; end: number }> = [];
  const tasks: Array<{ id: number; worker: number; start: number; duration: number }> = [];
  let time = 0;
  while (completed.size < dependencies.length) {
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].end <= time) {
        completed.add(active[i].index);
        active.splice(i, 1);
      }
    }
    for (let worker = 0; worker < available; worker++) {
      if (active.some((task) => task.worker === worker)) continue;
      const index = dependencies.findIndex(
        (deps, id) => !started.has(id) && deps.every((dep) => completed.has(dep)),
      );
      if (index < 0) continue;
      started.add(index);
      active.push({ index, worker, end: time + durations[index] });
      tasks.push({ id: ids[index], worker, start: time, duration: durations[index] });
    }
    if (active.length) time = Math.min(...active.map((task) => task.end));
  }
  const finishes: number[] = [];
  dependencies.forEach((deps, i) => {
    finishes[i] = durations[i] + Math.max(0, ...deps.map((dep) => finishes[dep]));
  });
  return {
    tasks,
    duration: time,
    work: durations.reduce((sum, duration) => sum + duration, 0),
    span: Math.max(...finishes),
  };
}
