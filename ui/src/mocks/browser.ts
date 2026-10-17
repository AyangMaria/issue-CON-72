import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

type MockWorkerRuntime = {
  worker: ReturnType<typeof setupWorker>;
  startPromise: Promise<void> | null;
};

// Preserve one browser worker when Next.js refreshes modules after a code edit.
// Replacing a running worker can leave requests without their mock handlers.
const mockGlobal = globalThis as typeof globalThis & {
  __consizeMockWorker?: MockWorkerRuntime;
};
const runtime = mockGlobal.__consizeMockWorker ??= {
  worker: setupWorker(...handlers),
  startPromise: null,
};

export const worker = runtime.worker;
// Apply edited handlers to the existing worker during development refreshes.
worker.resetHandlers(...handlers);

export function startMockServiceWorker(): Promise<void> {
  // Concurrent API requests share one startup attempt and wait for it to finish.
  if (!runtime.startPromise) {
    runtime.startPromise = worker.start({ onUnhandledRequest: "bypass" })
      .then(() => undefined)
      .catch((error: unknown) => {
        // MSW can be partly enabled when startup fails. Reset it as well as
        // the promise so a later attempt does not mistake it for a ready worker.
        try {
          worker.stop();
        } finally {
          runtime.startPromise = null;
        }
        throw error;
      });
  }

  return runtime.startPromise;
}

// Recover a stale mock connection without reloading the browser document.
export async function restartMockServiceWorker(): Promise<void> {
  await runtime.startPromise?.catch(() => undefined);
  worker.stop();
  runtime.startPromise = null;
  await startMockServiceWorker();
}