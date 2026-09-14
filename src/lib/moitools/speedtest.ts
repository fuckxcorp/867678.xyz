import { el } from "./dom";
import { createSpeedChart, type SpeedPhase } from "./speedchart";
import { fetchWithTimeout, pauseBackgroundNetworkTasks } from "./network";

const LATENCY_TARGETS = [
  "https://www.gstatic.com/generate_204",
  "https://cp.cloudflare.com/generate_204",
  "https://www.apple.com/library/test/success.html",
  "https://www.qualcomm.cn/cdn-cgi/trace",
  "https://www.miwifi.com/statics/img/wf_btn_off.png",
  "https://necaptcha.nosdn.127.net/ab7f4275c1744aa28e0a8f3a1c58c532.png",
  "https://perfops.byte-test.com/500b-bench.jpg",
  "https://img.alicdn.com/imgextra/i1/O1CN01xA4P9S1JsW2WEg0e1_!!6000000001084-2-tps-2880-560.png",
];

const DOWNLOAD_SOURCES = [
  "https://speed.cloudflare.com/__down?bytes=9999999",
  "https://la.867678.xyz/speedtest",
  "https://sg.867678.xyz/speedtest",
];

const UPLOAD_URL = "https://speed.cloudflare.com/__up";
const UPLOAD_STREAMS = 4;

const PING_MS = 1_000;
const DOWN_MS = 8_000;
const UP_MS = 8_000;
const UPLOAD_CHUNK = 512 * 1024;

/** 与 wait 相同，但外部信号中止时立刻拒绝，用于离开页面时终止整个测速 */
const abortableWait = (ms: number, external: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (external.aborted) {
      reject(external.reason);
      return;
    }
    const timer = window.setTimeout(resolve, ms);
    external.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(external.reason);
      },
      { once: true },
    );
  });

/** 合并运行期信号与阶段内超时/截止信号 */
const withExternal = (
  signal: AbortSignal,
  external: AbortSignal,
): AbortSignal => AbortSignal.any([signal, external]);

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";

/** 当前测速的运行期控制器；离开页面时由 astro:before-swap 调用中止 */
let activeRun: AbortController | null = null;

export const cancelActiveSpeedtest = (): void => {
  activeRun?.abort();
  activeRun = null;
};

const mbps = (bytes: number, elapsedMs: number): string => {
  const seconds = elapsedMs / 1000;
  if (bytes <= 0 || seconds <= 0) return "Failed";
  return `${((bytes * 8) / 1e6 / seconds).toFixed(2)} Mbps`;
};

const liveSpeed = (
  element: HTMLElement,
  bytes: () => number,
  started: number,
  phase: SpeedPhase,
  chart: ReturnType<typeof createSpeedChart>,
): number => {
  let lastBytes = 0;
  let lastAt = started;
  return window.setInterval(() => {
    const now = performance.now();
    const elapsed = now - started;
    const total = bytes();
    const windowS = (now - lastAt) / 1000;
    if (windowS > 0) {
      chart.add(phase, ((total - lastBytes) * 8) / 1e6 / windowS);
    }
    lastBytes = total;
    lastAt = now;
    if (elapsed > 200) element.textContent = mbps(total, elapsed);
  }, 150);
};

const pingRound = (external: AbortSignal) =>
  Promise.allSettled(
    LATENCY_TARGETS.map(async (url) => {
      const start = performance.now();
      await fetchWithTimeout(
        url,
        {
          mode: "no-cors",
          cache: "no-store",
          signal: withExternal(AbortSignal.timeout(PING_MS), external),
        },
        undefined,
        true,
      );
      return performance.now() - start;
    }),
  );

const testPing = async (
  element: HTMLElement,
  external: AbortSignal,
): Promise<boolean> => {
  element.textContent = "Testing latency...";
  const samples = (await pingRound(external)).flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  if (!samples.length) {
    element.textContent = "Timed out";
    return false;
  }
  element.textContent = `${Math.min(...samples).toFixed(1)} ms`;
  return true;
};

const testDownload = async (
  element: HTMLElement,
  chart: ReturnType<typeof createSpeedChart>,
  external: AbortSignal,
): Promise<void> => {
  element.textContent = "Connecting...";
  const controller = new AbortController();
  const started = performance.now();
  let totalBytes = 0;
  const timer = liveSpeed(element, () => totalBytes, started, "down", chart);
  const stop = window.setTimeout(() => controller.abort(), DOWN_MS);

  const pull = async (url: string): Promise<void> => {
    const response = await fetchWithTimeout(
      url,
      {
        signal: withExternal(controller.signal, external),
        cache: "no-store",
      },
      0,
      true,
    );
    if (!response.ok || !response.body) return;
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value?.byteLength ?? 0;
    }
  };

  try {
    // Hold the test open for the whole window even if every source finishes
    // early; controller.abort() is the real cutoff. Leaving the page aborts
    // the whole window via `external`.
    await Promise.all([
      Promise.allSettled(DOWNLOAD_SOURCES.map(pull)),
      abortableWait(DOWN_MS, external),
    ]);
  } catch (error) {
    if (!isAbort(error)) throw error;
  } finally {
    controller.abort();
    clearTimeout(stop);
    clearInterval(timer);
    element.textContent = mbps(
      totalBytes,
      Math.min(DOWN_MS, performance.now() - started),
    );
  }
};

const testUpload = async (
  element: HTMLElement,
  chart: ReturnType<typeof createSpeedChart>,
  external: AbortSignal,
): Promise<void> => {
  element.textContent = "Connecting...";
  const controller = new AbortController();
  const started = performance.now();
  let totalBytes = 0;
  const chunk = new Uint8Array(UPLOAD_CHUNK);
  const timer = liveSpeed(element, () => totalBytes, started, "up", chart);
  const stop = window.setTimeout(() => controller.abort(), UP_MS);

  const push = async (): Promise<void> => {
    while (!controller.signal.aborted && !external.aborted) {
      const response = await fetchWithTimeout(
        UPLOAD_URL,
        {
          method: "POST",
          body: chunk,
          signal: withExternal(controller.signal, external),
          cache: "no-store",
        },
        0,
        true,
      );
      if (!response.ok) return;
      totalBytes += chunk.byteLength;
    }
  };

  try {
    // Same as the download phase: wait the whole window, abort at the end.
    await Promise.all([
      Promise.allSettled(Array.from({ length: UPLOAD_STREAMS }, () => push())),
      abortableWait(UP_MS, external),
    ]);
  } catch (error) {
    if (!isAbort(error)) throw error;
  } finally {
    controller.abort();
    clearTimeout(stop);
    clearInterval(timer);
    element.textContent = mbps(
      totalBytes,
      Math.min(UP_MS, performance.now() - started),
    );
  }
};

export const initSpeed = (): void => {
  const button = el<HTMLButtonElement>("run-speedtest");
  const latency = el("latency");
  const download = el("download-speed");
  const upload = el("upload-speed");
  const canvas = el<HTMLCanvasElement>("speed-chart");
  if (!button || !latency || !download || !upload || !canvas) return;
  if (button.dataset.bound === "true") return;
  button.dataset.bound = "true";

  const chart = createSpeedChart(canvas);

  button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    const resumeBackground = pauseBackgroundNetworkTasks();
    const run = new AbortController();
    activeRun = run;
    try {
      const reachable = await testPing(latency, run.signal);
      if (!reachable) return;
      chart.start();
      await testDownload(download, chart, run.signal);
      await testUpload(upload, chart, run.signal);
    } catch (error) {
      if (!isAbort(error)) console.error("Speedtest failed:", error);
    } finally {
      if (activeRun === run) activeRun = null;
      resumeBackground();
      button.disabled = false;
    }
  });
};
