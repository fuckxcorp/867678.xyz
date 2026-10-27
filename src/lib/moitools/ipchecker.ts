import { setText } from "./dom";
import { fetchWithTimeout } from "./network";

const IPINFO_TOKEN = "eee846770ad167";
const IPINFO_LITE = `https://v4.api.ipinfo.io/lite/me?token=${IPINFO_TOKEN}`;
const IPINFO_LITE_V6 = `https://v6.api.ipinfo.io/lite/me?token=${IPINFO_TOKEN}`;

interface IpinfoLite {
  ip?: string;
  asn?: string;
  as_name?: string;
  asname?: string;
  country?: string;
  city?: string;
}

const json = async <T>(url: string): Promise<T> => {
  const response = await fetchWithTimeout(
    url,
    { cache: "no-store" },
    undefined,
    true,
  );
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
};

const asNameOf = (data: IpinfoLite): string =>
  data.as_name || data.asname || "Unavailable";

const loadIpinfo = async (
  url: string,
  ids: { ip: string; asn: string; asname: string },
): Promise<string | undefined> => {
  try {
    const data = await json<IpinfoLite>(url);
    setText(ids.ip, data.ip ?? "Unavailable");
    setText(ids.asn, data.asn ?? "Unavailable");
    setText(ids.asname, asNameOf(data));
    return data.city || data.country;
  } catch {
    setText(ids.ip, "Unavailable");
    setText(ids.asn, "Unavailable");
    setText(ids.asname, "Unavailable");
    return undefined;
  }
};

const loadIpip = async (): Promise<void> => {
  try {
    const response = await fetchWithTimeout(
      "https://myip.ipip.net/",
      { cache: "no-store" },
      undefined,
      true,
    );
    if (!response.ok) throw new Error(String(response.status));
    const text = await response.text();
    const match = text.match(/当前 IP：\s*(\S+).*?来自于：\s*(.+)/);
    if (!match) throw new Error("Unexpected ipip.net response");
    setText("ipip-ip", match[1]);
    setText("ipip-location", match[2].trim());
  } catch {
    setText("ipip-ip", "Unavailable");
    setText("ipip-location", "Unavailable");
  }
};

const loadMyIpCn = async (): Promise<void> => {
  try {
    const response = await fetchWithTimeout(
      "https://my.ip.cn/",
      { cache: "no-store" },
      undefined,
      true,
    );
    if (!response.ok) throw new Error(String(response.status));
    const text = await response.text();
    const match = text.match(
      /ip\s*[：:]\s*(\d{1,3}(?:\.\d{1,3}){3}|[\da-f:]+)\s+归属地\s*[：:]\s*(.+)/i,
    );
    const ip = match?.[1];
    const location = match?.[2]?.trim();
    if (!ip) throw new Error("Unexpected my.ip.cn response");

    setText("myip-ip", ip);
    setText("myip-location", location || "Unavailable");
  } catch {
    setText("myip-ip", "Unavailable");
    setText("myip-location", "Unavailable");
  }
};

const loadPreferredIp = async (): Promise<void> => {
  try {
    const data = await json<{ ip?: string }>(
      `https://api.ipinfo.io/lite/me?token=${IPINFO_TOKEN}`,
    );
    if (!data.ip) {
      setText("ipinfo-preferred", "Unavailable");
      return;
    }
    setText("ipinfo-preferred", data.ip.includes(":") ? "IPv6" : "IPv4");
  } catch {
    setText("ipinfo-preferred", "Unavailable");
  }
};

export const initIp = async (): Promise<void> => {
  // Either lookup may report a location: use the first one that does, and
  // only show "Unavailable" after both have failed.
  let found: string | undefined;
  let remaining = 2;

  const applyLocation = (place?: string): void => {
    found ??= place;
    remaining -= 1;
    if (found) setText("ipinfo-location", found);
    else if (remaining === 0) setText("ipinfo-location", "Unavailable");
  };

  await Promise.all([
    loadIpinfo(IPINFO_LITE, {
      ip: "ipinfo-v4",
      asn: "ipinfo-asn4",
      asname: "ipinfo-asname4",
    }).then(applyLocation),
    loadIpinfo(IPINFO_LITE_V6, {
      ip: "ipinfo-v6",
      asn: "ipinfo-asn6",
      asname: "ipinfo-asname6",
    }).then(applyLocation),
    loadIpip(),
    loadMyIpCn(),
    loadPreferredIp(),
  ]);
};
