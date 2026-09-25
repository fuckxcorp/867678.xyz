export type SpeedPhase = "down" | "up";

interface Sample {
  t: number;
  mbps: number;
  phase: SpeedPhase;
}

const PHASE_S = 8;
const TOTAL_S = PHASE_S * 2;

const cssVar = (el: HTMLElement, name: string): string =>
  getComputedStyle(el).getPropertyValue(name).trim();

const niceMax = (value: number): number => {
  if (value <= 1) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const mantissa = value / exp;
  const nice = mantissa <= 1 ? 1 : mantissa <= 2 ? 2 : mantissa <= 5 ? 5 : 10;
  return nice * exp;
};

const line = (
  ctx: CanvasRenderingContext2D,
  points: Sample[],
  xOf: (t: number) => number,
  yOf: (v: number) => number,
  color: string,
): void => {
  if (!points.length) return;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = xOf(point.t);
    const y = yOf(point.mbps);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  if (points.length < 2) return;
  ctx.lineTo(xOf(points[points.length - 1].t), yOf(0));
  ctx.lineTo(xOf(points[0].t), yOf(0));
  ctx.closePath();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
};

export const createSpeedChart = (canvas: HTMLCanvasElement) => {
  const samples: Sample[] = [];
  const ctx = canvas.getContext("2d");
  let origin = 0;

  const now = (): number => (origin ? (performance.now() - origin) / 1000 : 0);

  const draw = (): void => {
    if (!ctx) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width < 2 || height < 2) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const pad = { l: 40, r: 10, t: 12, b: 24 };
    const plotW = width - pad.l - pad.r;
    const plotH = height - pad.t - pad.b;
    const elapsed = Math.max(now(), samples.at(-1)?.t ?? 0);
    const xMax = Math.min(TOTAL_S, Math.max(elapsed, 0.5));
    const maxY = niceMax(
      Math.max(1, ...samples.map((sample) => sample.mbps)) * 1.08,
    );
    const xOf = (t: number) => pad.l + (t / xMax) * plotW;
    const yOf = (value: number) => pad.t + (1 - value / maxY) * plotH;

    const grid = cssVar(canvas, "--color-border");
    const muted = cssVar(canvas, "--color-text-muted");
    const down = cssVar(canvas, "--speed-down");
    const up = cssVar(canvas, "--speed-up");

    ctx.font = "11px Segoe UI, Roboto, sans-serif";
    ctx.fillStyle = muted;
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;

    for (let i = 0; i <= 4; i += 1) {
      const value = (maxY * i) / 4;
      const y = yOf(value);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(width - pad.r, y);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(
        `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}`,
        pad.l - 6,
        y,
      );
    }

    if (xMax > PHASE_S) {
      ctx.beginPath();
      ctx.moveTo(xOf(PHASE_S), pad.t);
      ctx.lineTo(xOf(PHASE_S), pad.t + plotH);
      ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("0s", xOf(0), pad.t + plotH + 6);
    if (xMax > 2) {
      ctx.fillText(
        `${xMax >= 10 ? xMax.toFixed(0) : xMax.toFixed(1)}s`,
        xOf(xMax),
        pad.t + plotH + 6,
      );
    }

    line(
      ctx,
      samples.filter((sample) => sample.phase === "down"),
      xOf,
      yOf,
      down || "#5b7aa8",
    );
    line(
      ctx,
      samples.filter((sample) => sample.phase === "up"),
      xOf,
      yOf,
      up || "#8a6b4a",
    );
  };

  const add = (phase: SpeedPhase, mbps: number): void => {
    if (!origin) origin = performance.now();
    samples.push({
      t: Math.min(TOTAL_S, now()),
      mbps: Math.max(0, mbps),
      phase,
    });
    draw();
  };

  const start = (): void => {
    samples.length = 0;
    origin = performance.now();
    draw();
  };

  const observer = new ResizeObserver(() => draw());
  observer.observe(canvas);
  const theme = new MutationObserver(() => draw());
  theme.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  draw();

  const destroy = (): void => {
    observer.disconnect();
    theme.disconnect();
  };

  return { add, start, draw, destroy };
};
