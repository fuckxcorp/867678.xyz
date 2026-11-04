import { fetchWithTimeout } from "./network";

interface LeakRow {
  ip?: string;
  type?: string;
}

interface IpinfoLite {
  asn?: string;
  as_name?: string;
  asname?: string;
  country?: string;
  country_code?: string;
}

interface ResolverView {
  ip: string;
  flag: string;
  country: string;
  asn: string;
}

const BASH = "https://bash.ws";
const IPINFO_TOKEN = "eee846770ad167";
// The official bash.ws test fires 10 probe subdomains; fewer can miss resolvers.
const PROBES = 10;

const json = async <T>(url: string, signal?: AbortSignal): Promise<T> => {
  const response = await fetchWithTimeout(url, { cache: "no-store", signal });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
};

const text = async (url: string, signal?: AbortSignal): Promise<string> => {
  const response = await fetchWithTimeout(url, { cache: "no-store", signal });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);
  return (await response.text()).trim();
};

const flagOf = (code: string): string => {
  const country = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return "";
  return String.fromCodePoint(
    ...[...country].map((letter) => 0x1f1e6 - 65 + letter.charCodeAt(0)),
  );
};

const lookup = async (
  ip: string,
  signal?: AbortSignal,
): Promise<IpinfoLite> => {
  try {
    return await json<IpinfoLite>(
      `https://api.ipinfo.io/lite/${encodeURIComponent(ip)}?token=${IPINFO_TOKEN}`,
      signal,
    );
  } catch {
    return {};
  }
};

const triggerLookups = async (
  id: string,
  signal: AbortSignal,
): Promise<void> => {
  await Promise.allSettled(
    Array.from({ length: PROBES }, (_, index) =>
      fetchWithTimeout(`https://${index}.${id}.bash.ws/?t=${Date.now()}`, {
        mode: "no-cors",
        cache: "no-store",
        signal,
      }),
    ),
  );
};

const wait = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeout = window.setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(signal.reason);
      },
      { once: true },
    );
  });

const setState = (state: "wait" | "ok" | "fail"): void => {
  document.getElementById("dns-results")?.setAttribute("data-state", state);
};

const setList = (nodes: HTMLElement[]): void => {
  const list = document.getElementById("dns-resolvers");
  if (!list) return;
  list.replaceChildren(...nodes);
};

const emptyItem = (label: string): HTMLLIElement => {
  const item = document.createElement("li");
  item.className = "dns-empty";
  item.textContent = label;
  return item;
};

const resolverItem = (view: ResolverView): HTMLLIElement => {
  const item = document.createElement("li");
  item.className = "dns-resolver";

  const country = document.createElement("span");
  country.className = "dns-resolver-country";
  country.textContent = [view.flag, view.country].filter(Boolean).join(" ");

  const ip = document.createElement("span");
  ip.className = "dns-resolver-ip";
  ip.textContent = view.ip;

  const meta = document.createElement("span");
  meta.className = "dns-resolver-meta";
  meta.textContent = `Provider:${view.asn}`;

  item.append(country, ip, meta);
  return item;
};

const enrich = async (
  ip: string,
  signal: AbortSignal,
): Promise<ResolverView> => {
  const info = await lookup(ip, signal);
  const code = info.country_code || "";
  return {
    ip,
    flag: flagOf(code),
    country: info.country || code || "Unknown",
    asn:
      [info.asn, info.as_name || info.asname].filter(Boolean).join(" ") ||
      "Unknown",
  };
};

const run = async (signal: AbortSignal): Promise<void> => {
  setState("wait");
  setList([emptyItem("Testing...")]);

  try {
    const id = await text(`${BASH}/id`, signal);
    if (!id) throw new Error("Missing test id");
    await triggerLookups(id, signal);

    // Resolver results are not ready right after the probes; poll with
    // increasing delays before giving up.
    let results: LeakRow[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (attempt) await wait(800 * attempt, signal);
      results = await json<LeakRow[]>(
        `${BASH}/dnsleak/test/${id}?json`,
        signal,
      );
      const resolvers = results.filter((row) => row.type === "dns" && row.ip);
      if (resolvers.length) {
        const views = await Promise.all(
          resolvers.map((row) => enrich(row.ip as string, signal)),
        );
        setList(views.map(resolverItem));
        setState("ok");
        return;
      }
    }

    setList([emptyItem("No resolvers reported")]);
    setState("fail");
  } catch (error) {
    if (signal.aborted) throw error;
    setList([emptyItem("Failed")]);
    setState("fail");
  }
};

export const initDns = async (signal: AbortSignal): Promise<void> => {
  const root = document.getElementById("dns-results");
  if (!root || root.dataset.bound === "true") return;
  await run(signal);
  root.dataset.bound = "true";
};
