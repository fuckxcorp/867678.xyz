const REQUEST_TIMEOUT_MS = 5_000;

type NetworkTask = (signal: AbortSignal) => Promise<void>;

let backgroundQueue = Promise.resolve();
let speedtestActive = false;
let resumeBackground = Promise.resolve();
let releaseBackground = (): void => {};
let backgroundGeneration = 0;
const activeBackground = new Set<AbortController>();
const activePageRequests = new Set<AbortController>();

const waitForBackgroundWindow = async (): Promise<void> => {
  while (speedtestActive) await resumeBackground;
};

export const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
  keepDuringSpeedtest = false,
): Promise<Response> => {
  if (!keepDuringSpeedtest) await waitForBackgroundWindow();
  const controller = new AbortController();
  const abort = () => controller.abort(init.signal?.reason);
  const timeout = timeoutMs
    ? window.setTimeout(() => controller.abort(), timeoutMs)
    : undefined;

  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener("abort", abort, { once: true });
  if (!keepDuringSpeedtest) activePageRequests.add(controller);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    activePageRequests.delete(controller);
    if (timeout !== undefined) window.clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abort);
  }
};

export const enqueueBackgroundNetworkTask = (task: NetworkTask): void => {
  const generation = backgroundGeneration;
  const run = async (): Promise<void> => {
    while (true) {
      if (generation !== backgroundGeneration) return;
      await waitForBackgroundWindow();
      if (generation !== backgroundGeneration) return;
      const controller = new AbortController();
      activeBackground.add(controller);
      try {
        await task(controller.signal);
        return;
      } catch (error) {
        if (!controller.signal.aborted) throw error;
        if (generation !== backgroundGeneration) return;
      } finally {
        activeBackground.delete(controller);
      }
    }
  };

  backgroundQueue = backgroundQueue.then(run, run);
};

export const cancelBackgroundNetworkTasks = (): void => {
  backgroundGeneration += 1;
  for (const controller of activeBackground) controller.abort();
};

export const pauseBackgroundNetworkTasks = (): (() => void) => {
  speedtestActive = true;
  resumeBackground = new Promise((resolve) => {
    releaseBackground = resolve;
  });
  for (const controller of activeBackground) controller.abort();
  for (const controller of activePageRequests) controller.abort();

  return () => {
    speedtestActive = false;
    releaseBackground();
  };
};
