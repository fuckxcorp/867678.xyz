import { el } from "./dom";
import { createSpeedChart, type SpeedPhase } from "./speedchart";
import { fetchWithTimeout, pauseBackgroundNetworkTasks } from "./network";

const LATENCY_TARGETS = [
  "https://www.gstatic.com/generate_204",
  "https://yt3.ggpht.com/favicon.ico",
  "https://cp.cloudflare.com/generate_204",
  "https://www.apple.com/library/test/success.html",
  "https://www.qualcomm.cn/cdn-cgi/trace",
  "https://www.miwifi.com/statics/img/wf_btn_off.png",
  "https://necaptcha.nosdn.127.net/ab7f4275c1744aa28e0a8f3a1c58c532.png",
  "https://i0.hdslb.com/bfs/face/member/noface.jpg@24w_24h_1c",
  "https://img.alicdn.com/imgextra/i2/O1CN01qnQCrN1VkzAWiU4Hs_!!6000000002692-2-tps-33-33.png",
  "https://lf3-zlink-tos.ugurl.cn/obj/zebra-public/resource_lmmizj_1632398893.png",
  "https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico"
];

const DOWNLOAD_SOURCES = [
  "https://speed.cloudflare.com/__down?bytes=9999999",
  "https://la.867678.xyz/speedtest",
  "https://sg.867678.xyz/speedtest",
  "https://ki.867678.xyz/speedtest",
];

const UPLOAD_URL = "https://speed.cloudflare.com/__up";
const UPLOAD_STREAMS = 4;

const PING_MS = 1_000;
const PING_SAMPLES = 5;
const DOWN_MS = 8_000;
const UP_MS = 8_000;
const UPLOAD_CHUNK = 512 * 1024;

const abortableWait = (ms: number, external: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (external.aborted) {
      reject(external.reason);
      return;
    }
    const onAbort = (): void => {
      window.clearTimeout(timer);
      reject(external.reason);
    };
    const timer = window.setTimeout(() => {
      external.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    external.addEventListener("abort", onAbort, { once: true });
  });

const withExternal = (
  signal: AbortSignal,
  external: AbortSignal,
): AbortSignal => AbortSignal.any([signal, external]);

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";

const announce = (message: string): void => {
  const status = el("speed-status");
  if (status) status.textContent = message;
};

let activeRun: AbortController | null = null;
let activeChart: ReturnType<typeof createSpeedChart> | null = null;

export const cancelActiveSpeedtest = (): void => {
  activeRun?.abort();
  activeRun = null;
  activeChart?.destroy();
  activeChart = null;
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

const probeLatency = async (
  source: string,
  external: AbortSignal,
): Promise<{ source: string; latency: number }> => {
  const url = new URL(source);
  url.searchParams.set("_", crypto.randomUUID());
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
  return { source, latency: performance.now() - start };
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const testPing = async (
  element: HTMLElement,
  external: AbortSignal,
): Promise<boolean> => {
  element.textContent = "Testing latency...";
  announce("Testing latency");
  const candidates = (
    await Promise.allSettled(
      LATENCY_TARGETS.map((url) => probeLatency(url, external)),
    )
  ).flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  if (!candidates.length) {
    element.textContent = "Timed out";
    announce("Latency test timed out");
    return false;
  }
  const fastest = candidates.reduce((best, candidate) =>
    candidate.latency < best.latency ? candidate : best,
  );
  const samples: number[] = [];
  for (let index = 0; index < PING_SAMPLES; index += 1) {
    try {
      samples.push((await probeLatency(fastest.source, external)).latency);
    } catch (error) {
      if (external.aborted) throw error;
    }
  }
  if (!samples.length) {
    element.textContent = "Timed out";
    announce("Latency test timed out");
    return false;
  }
  element.textContent = `${median(samples).toFixed(1)} ms`;
  announce(`Latency ${element.textContent}`);
  return true;
};

const testDownload = async (
  element: HTMLElement,
  chart: ReturnType<typeof createSpeedChart>,
  external: AbortSignal,
): Promise<void> => {
  element.textContent = "Connecting...";
  announce("Testing download speed");
  const controller = new AbortController();
  const started = performance.now();
  let totalBytes = 0;
  const timer = liveSpeed(element, () => totalBytes, started, "down", chart);
  const stop = window.setTimeout(() => controller.abort(), DOWN_MS);

  const pull = async (source: string): Promise<void> => {
    const signal = withExternal(controller.signal, external);
    while (!signal.aborted) {
      const url = new URL(source);
      url.searchParams.set("_", crypto.randomUUID());
      const response = await fetchWithTimeout(
        url,
        { signal, cache: "no-store" },
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
    announce(`Download ${element.textContent}`);
  }
};

const testUpload = async (
  element: HTMLElement,
  chart: ReturnType<typeof createSpeedChart>,
  external: AbortSignal,
): Promise<void> => {
  element.textContent = "Connecting...";
  announce("Testing upload speed");
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
    announce(`Upload ${element.textContent}. Speed test complete`);
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
  activeChart = chart;

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
