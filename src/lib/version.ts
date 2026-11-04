import pkg from "../../package.json";

/** Version taken from package.json, e.g. "5.0.0". */
export const version: string = pkg.version;

function fmtTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const offsetHours = pad(Math.floor(Math.abs(offsetMinutes) / 60));
  const offsetMins = pad(Math.abs(offsetMinutes) % 60);

  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
  const timePart = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds(),
  )}`;

  return `${datePart} ${timePart} UTC${sign}${offsetHours}${offsetMins}`;
}

const buildDate = new Date();

/** Human-readable build timestamp in the site's timezone, e.g. "2026-08-11 16:30:00 UTC+0800". */
export const buildTime: string = fmtTime(buildDate);

/** ISO-8601 build timestamp for machine-readable attributes such as <time datetime>. */
export const buildIso: string = buildDate.toISOString();
