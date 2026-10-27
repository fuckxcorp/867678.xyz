import { el } from "./dom";
import { createSpeedChart } from "./speedchart";
import { fetchWithTimeout, pauseBackgroundNetworkTasks } from "./network";

const LATENCY_TARGETS = [
  "https://www.gstatic.com/generate_204",
  "https://yt3.ggpht.com/favicon.ico",
  "https://cp.cloudflare.com/generate_204",
  "https://www.apple.com/library/test/success.html",
  "https://www.qualcomm.cn/cdn-cgi/trace",
  "https://www.miwifi.com/statics/img/wf_btn_off.png",
  "https://necaptcha.nosdn.127.net/ab7f4275c1744aa28e0a8f3a1c58c532.png",
  "https://img.alicdn.com/imgextra/i2/O1CN01qnQCrN1VkzAWiU4Hs_!!6000000002692-2-tps-33-33.png",
  "https://lf3-zlink-tos.ugurl.cn/obj/zebra-public/resource_lmmizj_1632398893.png",
  "https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico",
];

const DOWNLOAD_SOURCES = [
  "https://speed.cloudflare.com/__down?bytes=9999999",
  "https://la.867678.xyz/speedtest",
  "https://sg.867678.xyz/speedtest",
  "https://ki.867678.xyz/speedtest",
];

const UPLOAD_URL = "https://speed.cloudflare.com/__up";
const DOWNLOAD_STREAMS_PER_SOURCE = 2;
const UPLOAD_STREAMS = 8;

const PING_MS = 1_000;
const PING_SAMPLES = 5;
const DOWN_MS = 10_000;
const UP_MS = 6_000;
const CONNECT_TIMEOUT_MS = 10_000;
const UPLOAD_CHUNK = 8 * 1024 * 1024;

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
let activeCharts: ReturnType<typeof createSpeedChart>[] = [];

export const cancelActiveSpeedtest = (): void => {
  activeRun?.abort();
  activeRun = null;
  activeCharts.forEach((chart) => chart.destroy());
  activeCharts = [];
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
  chart: ReturnType<typeof createSpeedChart>,
  chartBytes: () => number = bytes,
): number => {
  let lastAt = started;
  return window.setInterval(() => {
    const now = performance.now();
    const elapsed = now - started;
    const total = bytes();
    const transferred = chartBytes();
    const windowS = (now - lastAt) / 1000;
    if (windowS > 0 && elapsed > 0 && transferred > 0) {
      chart.add(((transferred * 8) / 1e6 / elapsed) * 1000);
    }
    lastAt = now;
    if (total === 0) {
      element.textContent = "Warming up...";
    } else {
      element.textContent = mbps(total, elapsed);
    }
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
  let started = 0;
  let totalBytes = 0;
  let timer: number | undefined;
  let connectTimeout: number | undefined;
  let measurementTimeout: number | undefined;

  const beginMeasurement = (): void => {
    if (started) return;
    started = performance.now();
    chart.start();
    timer = liveSpeed(element, () => totalBytes, started, chart);
    if (connectTimeout !== undefined) window.clearTimeout(connectTimeout);
    measurementTimeout = window.setTimeout(() => controller.abort(), DOWN_MS);
  };

  connectTimeout = window.setTimeout(
    () => controller.abort(),
    CONNECT_TIMEOUT_MS,
  );

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
        const received = value?.byteLength ?? 0;
        if (received > 0) beginMeasurement();
        totalBytes += received;
      }
    }
  };

  try {
    await Promise.allSettled(
      DOWNLOAD_SOURCES.flatMap((source) =>
        Array.from({ length: DOWNLOAD_STREAMS_PER_SOURCE }, () => pull(source)),
      ),
    );
    if (!started) {
      element.textContent = "Failed";
      announce("Download test failed to connect");
      return;
    }
  } catch (error) {
    if (!isAbort(error)) throw error;
  } finally {
    controller.abort();
    if (connectTimeout !== undefined) clearTimeout(connectTimeout);
    if (measurementTimeout !== undefined) clearTimeout(measurementTimeout);
    if (timer !== undefined) clearInterval(timer);
    if (started) {
      element.textContent = mbps(
        totalBytes,
        Math.min(DOWN_MS, performance.now() - started),
      );
      announce(`Download ${element.textContent}`);
    }
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
  let started = 0;
  let totalBytes = 0;
  const chunk = new Uint8Array(UPLOAD_CHUNK);
  let timer: number | undefined;
  let connectTimeout: number | undefined;
  let measurementTimeout: number | undefined;

  const beginMeasurement = (): void => {
    if (started) return;
    started = performance.now();
    chart.start();
    timer = liveSpeed(element, () => totalBytes, started, chart);
    if (connectTimeout !== undefined) window.clearTimeout(connectTimeout);
    measurementTimeout = window.setTimeout(() => controller.abort(), UP_MS);
  };

  connectTimeout = window.setTimeout(
    () => controller.abort(),
    CONNECT_TIMEOUT_MS,
  );

  const uploadOnce = (signal: AbortSignal): Promise<boolean> =>
    new Promise((resolve) => {
      if (signal.aborted) {
        resolve(false);
        return;
      }

      const request = new XMLHttpRequest();
      let counted = 0;
      let settled = false;
      const record = (event: ProgressEvent): void => {
        const loaded = Math.min(event.loaded, chunk.byteLength);
        const delta = Math.max(0, loaded - counted);
        if (delta > 0) beginMeasurement();
        totalBytes += delta;
        counted = loaded;
      };
      const finish = (success: boolean): void => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", abort);
        resolve(success);
      };
      const abort = (): void => request.abort();

      request.upload.addEventListener("progress", record);
      request.upload.addEventListener("load", record);
      request.addEventListener(
        "load",
        () => finish(request.status >= 200 && request.status < 300),
        { once: true },
      );
      request.addEventListener("error", () => finish(false), { once: true });
      request.addEventListener("abort", () => finish(false), { once: true });
      signal.addEventListener("abort", abort, { once: true });

      request.open("POST", UPLOAD_URL);
      request.send(chunk);
    });

  const push = async (): Promise<void> => {
    const signal = withExternal(controller.signal, external);
    while (!signal.aborted && (await uploadOnce(signal))) {}
  };

  try {
    await Promise.allSettled(
      Array.from({ length: UPLOAD_STREAMS }, () => push()),
    );
    if (!started) {
      element.textContent = "Failed";
      announce("Upload test failed to connect");
      return;
    }
  } catch (error) {
    if (!isAbort(error)) throw error;
  } finally {
    controller.abort();
    if (connectTimeout !== undefined) clearTimeout(connectTimeout);
    if (measurementTimeout !== undefined) clearTimeout(measurementTimeout);
    if (timer !== undefined) clearInterval(timer);
    if (started) {
      element.textContent = mbps(
        totalBytes,
        Math.min(UP_MS, performance.now() - started),
      );
      announce(`Upload ${element.textContent}. Speed test complete`);
    }
  }
};

export const initSpeed = (): void => {
  const button = el<HTMLButtonElement>("run-speedtest");
  const latency = el("latency");
  const download = el("download-speed");
  const upload = el("upload-speed");
  const downloadCanvas = el<HTMLCanvasElement>("download-chart");
  const uploadCanvas = el<HTMLCanvasElement>("upload-chart");
  if (
    !button ||
    !latency ||
    !download ||
    !upload ||
    !downloadCanvas ||
    !uploadCanvas
  )
    return;
  if (button.dataset.bound === "true") return;
  button.dataset.bound = "true";

  const downloadChart = createSpeedChart(
    downloadCanvas,
    "down",
    DOWN_MS / 1000,
    4,
  );
  const uploadChart = createSpeedChart(uploadCanvas, "up", UP_MS / 1000, 3);
  activeCharts = [downloadChart, uploadChart];

  button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    const resumeBackground = pauseBackgroundNetworkTasks();
    const run = new AbortController();
    activeRun = run;
    try {
      const reachable = await testPing(latency, run.signal);
      if (!reachable) return;
      await testDownload(download, downloadChart, run.signal);
      await testUpload(upload, uploadChart, run.signal);
    } catch (error) {
      if (!isAbort(error)) console.error("Speedtest failed:", error);
    } finally {
      if (activeRun === run) activeRun = null;
      resumeBackground();
      button.disabled = false;
    }
  });
};
