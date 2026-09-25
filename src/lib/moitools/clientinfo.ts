import { setText } from "./dom";
import { fetchWithTimeout } from "./network";

const hop = (entry?: PerformanceEntry): string =>
  (
    (entry as PerformanceResourceTiming | undefined)?.nextHopProtocol ?? ""
  ).toLowerCase();

const isH3 = (protocol: string): boolean =>
  protocol === "h3" || protocol.startsWith("h3-");

const pageProtocol = (): string => {
  const nav = performance.getEntriesByType("navigation")[0];
  return hop(nav);
};

const probeProtocol = async (url: string): Promise<string> => {
  const href = new URL(url, location.href).href;
  let observer: PerformanceObserver | undefined;
  const fromObserver = new Promise<string>((resolve) => {
    if (typeof PerformanceObserver !== "function") {
      resolve("");
      return;
    }
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === href) {
          observer?.disconnect();
          resolve(hop(entry));
        }
      }
    });
    try {
      observer.observe({ type: "resource", buffered: true });
    } catch {
      observer.disconnect();
      observer = undefined;
      resolve("");
    }
  });

  let fallbackTimer: number | undefined;
  try {
    // 探测请求同样不参与测速让路，理由同 ipchecker.ts
    await fetchWithTimeout(href, { cache: "no-store" }, undefined, true);
    const fallback = hop(performance.getEntriesByName(href, "resource").at(-1));
    return await Promise.race([
      fromObserver.then((protocol) => protocol || fallback),
      new Promise<string>((resolve) => {
        fallbackTimer = window.setTimeout(() => resolve(fallback), 400);
      }),
    ]);
  } finally {
    observer?.disconnect();
    if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
  }
};

const labelOf = (protocol: string): string => {
  if (isH3(protocol)) return "Supported (HTTP/3)";
  if (protocol) return `Not negotiated (${protocol})`;
  return "Not exposed";
};

const testH3 = async (): Promise<void> => {
  setText("h3", "Testing...");

  try {
    const fromPage = pageProtocol();
    if (fromPage) {
      setText("h3", labelOf(fromPage));
      return;
    }

    const fromProbe = await probeProtocol(
      `${location.origin}/favicon.svg?h3=${Date.now()}`,
    );
    setText("h3", labelOf(fromProbe));
  } catch {
    setText("h3", "Test failed");
  }
};

export const initInfo = (): void => {
  setText("user-agent", navigator.userAgent);
  setText("language", navigator.language);
  setText(
    "timezone",
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown",
  );
  void testH3();
};
