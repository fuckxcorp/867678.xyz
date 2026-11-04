import { setText } from "./dom";

const STUN_SERVERS = [
  {
    id: "miwifi",
    host: "stun.miwifi.com",
    url: "stun:stun.miwifi.com:3478",
  },
  {
    id: "tencent",
    host: "stun.qq.com",
    url: "stun:stun.qq.com:3478",
  },
  {
    id: "cloudflare",
    host: "stun.cloudflare.com",
    url: "stun:stun.cloudflare.com:3478",
  },
  {
    id: "google",
    host: "stun.l.google.com",
    url: "stun:stun.l.google.com:19302",
  },
] as const;

type StunId = (typeof STUN_SERVERS)[number]["id"];
type RtcCtor = typeof RTCPeerConnection;

interface ProbeResult {
  status: string;
  state: "wait" | "ok" | "warn" | "fail";
  host: string[];
  srflx: string[];
}

const CANDIDATE =
  /(?:^|\s)candidate:\S+\s+\d+\s+\S+\s+\d+\s+(\S+)\s+\d+\s+typ\s+(\w+)/i;

const parseCandidate = (
  candidate: RTCIceCandidate,
): { ip: string; type: string } | undefined => {
  const type = candidate.type ?? "";
  const ip = candidate.address ?? "";
  if (ip && type) return { ip, type };

  const match = CANDIDATE.exec(candidate.candidate ?? "");
  if (!match) return undefined;
  return { ip: match[1], type: match[2].toLowerCase() };
};

const unique = (values: Iterable<string>): string[] => [...new Set(values)];

const formatIps = (ips: string[]): string[] => [...ips];

const fail = (status: string): ProbeResult => ({
  status,
  state: "fail",
  host: [],
  srflx: [],
});

const rtcCtor = (): RtcCtor | undefined => {
  if (typeof RTCPeerConnection === "function") return RTCPeerConnection;
  const legacy = (window as Window & { webkitRTCPeerConnection?: RtcCtor })
    .webkitRTCPeerConnection;
  return typeof legacy === "function" ? legacy : undefined;
};

const gather = (
  Peer: RtcCtor,
  iceServers: RTCIceServer[],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ host: string[]; srflx: string[]; error?: string }> =>
  new Promise((resolve) => {
    let pc: RTCPeerConnection;
    try {
      pc = new Peer({ iceServers });
    } catch {
      resolve({ host: [], srflx: [], error: "WebRTC disabled" });
      return;
    }

    const host = new Set<string>();
    const srflx = new Set<string>();
    let settled = false;

    const finish = (error?: string): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      pc.onicecandidate = null;
      pc.onicegatheringstatechange = null;
      signal?.removeEventListener("abort", onAbort);
      pc.close();
      resolve({ host: unique(host), srflx: unique(srflx), error });
    };

    const take = (candidate: RTCIceCandidate | null): void => {
      if (!candidate) {
        finish();
        return;
      }
      const parsed = parseCandidate(candidate);
      if (!parsed?.ip) return;
      if (parsed.type === "host") host.add(parsed.ip);
      if (parsed.type === "srflx") srflx.add(parsed.ip);
    };

    const timer = window.setTimeout(() => finish("STUN timeout"), timeoutMs);
    const onAbort = () => finish("Interrupted");

    pc.onicecandidate = (event) => take(event.candidate);
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === "complete") take(null);
    };
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });

    try {
      pc.createDataChannel("leak");
      void pc
        .createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => finish("WebRTC disabled"));
    } catch {
      finish("WebRTC disabled");
    }
  });

const probeStun = async (
  Peer: RtcCtor,
  url: string,
  signal: AbortSignal,
): Promise<ProbeResult> => {
  const gathered = await gather(Peer, [{ urls: url }], 6000, signal);
  if (gathered.srflx.length) {
    return {
      status: "Connected",
      state: "ok",
      host: gathered.host,
      srflx: gathered.srflx,
    };
  }
  if (gathered.host.length) {
    return {
      status: "No STUN reply",
      state: "warn",
      host: gathered.host,
      srflx: [],
    };
  }
  if (gathered.error === "STUN timeout") {
    return fail("STUN timeout");
  }
  return fail(gathered.error || "WebRTC disabled");
};

const render = (id: StunId, result: ProbeResult): void => {
  const row = document.getElementById(`stun-${id}`);
  row?.setAttribute("data-state", result.state);
  setText(`stun-${id}-status`, result.status);
  setText(`stun-${id}-host`, formatIps(result.host).join(", ") || "—");
  setText(`stun-${id}-srflx`, formatIps(result.srflx).join(", ") || "—");
};

export const initWebrtc = async (signal: AbortSignal): Promise<void> => {
  const root = document.getElementById("webrtc-results");
  if (!root || root.dataset.bound === "true") return;

  const Peer = rtcCtor();
  if (!Peer) {
    for (const server of STUN_SERVERS)
      render(server.id, fail("WebRTC unsupported"));
    root.dataset.bound = "true";
    return;
  }

  const preflight = await gather(Peer, [], 2500, signal);
  if (signal.aborted) throw signal.reason;
  if (!preflight.host.length && !preflight.srflx.length) {
    const reason =
      preflight.error === "STUN timeout"
        ? "WebRTC disabled"
        : preflight.error || "WebRTC disabled";
    for (const server of STUN_SERVERS) render(server.id, fail(reason));
    root.dataset.bound = "true";
    return;
  }

  await Promise.all(
    STUN_SERVERS.map(async (server) => {
      render(server.id, await probeStun(Peer, server.url, signal));
    }),
  );
  if (signal.aborted) throw signal.reason;
  root.dataset.bound = "true";
};
