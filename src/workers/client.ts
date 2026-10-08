// Main-thread side of the simulation worker: one day per worker, so two branches run side by side.
import type { DayResult, RunDayRequest, WorkerReply } from './handlers.ts';

export interface RunningDay {
  promise: Promise<DayResult>;
  /** Ends the worker. The promise rejects with Error('cancelled'). Harmless once the day has finished. */
  cancel: () => void;
}

export function runDayInWorker(req: Omit<RunDayRequest, 'type' | 'id'>): RunningDay {
  const worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
  let settled = false;
  let reject: (e: Error) => void = () => {};
  const promise = new Promise<DayResult>((res, rej) => {
    reject = rej;
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      const reply = e.data;
      if (reply.type === 'day') res(reply.result);
      else rej(new Error(reply.message));
    };
    worker.onerror = (e) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      rej(new Error(e.message || 'The worker failed'));
    };
    const message: RunDayRequest = { type: 'runDay', id: 1, ...req };
    worker.postMessage(message);
  });
  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      worker.terminate();
      reject(new Error('cancelled'));
    },
  };
}
