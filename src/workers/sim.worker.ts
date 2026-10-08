// Runs headless days off the main thread. All the logic is in handlers.ts.
import { handle, type WorkerRequest } from './handlers.ts';

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  self.postMessage(handle(e.data));
};
