export type SpeedPhase = "down" | "up";

interface Sample {
  t: number;
  mbps: number;
}

const SMOOTHING_SAMPLES = 7;

const cssVar = (el: HTMLElement, name: string): string =>
  getComputedStyle(el).getPropertyValue(name).trim();

const niceMax = (value: number): number => {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const mantissa = value / exp;
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10];
  const nice = steps.find((step) => step >= mantissa) ?? 10;
  return nice * exp;
};

const percentile = (values: number[], fraction: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
  ];
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
  if (points.length === 1) {
    const point = points[0];
    ctx.beginPath();
    ctx.moveTo(xOf(point.t), yOf(point.mbps));
    ctx.lineTo(xOf(point.t) + 3, yOf(point.mbps));
    ctx.stroke();
    return;
  }
  if (points.length < 2) return;
  ctx.lineTo(xOf(points[points.length - 1].t), yOf(0));
  ctx.lineTo(xOf(points[0].t), yOf(0));
  ctx.closePath();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
};

export const createSpeedChart = (
  canvas: HTMLCanvasElement,
  phase: SpeedPhase,
  durationSeconds: number,
  timeTickSeconds: number,
) => {
  const samples: Sample[] = [];
  const recentSpeeds: number[] = [];
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

    const pad = { l: 50, r: 10, t: 12, b: 24 };
    const plotW = width - pad.l - pad.r;
    const plotH = height - pad.t - pad.b;
    const xMax = durationSeconds;
    const recentMax = Math.max(
      0,
      ...samples.slice(-7).map((sample) => sample.mbps),
    );
    const maxY = samples.length
      ? niceMax(
          Math.max(
            1,
            percentile(
              samples.map((sample) => sample.mbps),
              0.95,
            ),
            recentMax,
          ) * 1.08,
        )
      : 750;
    const xOf = (t: number) => pad.l + (t / xMax) * plotW;
    const yOf = (value: number) => pad.t + (1 - value / maxY) * plotH;

    const grid = cssVar(canvas, "--color-border");
    const muted = cssVar(canvas, "--color-text-muted");
    const color = cssVar(
      canvas,
      phase === "down" ? "--speed-down" : "--speed-up",
    );

    ctx.font = "11px Segoe UI, Roboto, sans-serif";
    ctx.fillStyle = muted;
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;

    for (let i = 0; i <= 5; i += 1) {
      const value = (maxY * i) / 5;
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

    ctx.save();
    ctx.translate(11, pad.t + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = muted;
    ctx.fillText("Mbps", 0, 0);
    ctx.restore();

    for (
      let second = timeTickSeconds;
      second < durationSeconds;
      second += timeTickSeconds
    ) {
      ctx.beginPath();
      ctx.moveTo(xOf(second), pad.t);
      ctx.lineTo(xOf(second), pad.t + plotH);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = muted;
      ctx.fillText(`${second}s`, xOf(second), pad.t + plotH + 6);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("0s", xOf(0), pad.t + plotH + 6);
    if (durationSeconds % timeTickSeconds !== 0) {
      ctx.textAlign = "center";
      ctx.fillText(
        `${durationSeconds}s`,
        xOf(durationSeconds),
        pad.t + plotH + 6,
      );
    }

    line(ctx, samples, xOf, yOf, color || "#5b7aa8");
  };

  const add = (mbps: number): void => {
    if (!origin) origin = performance.now();
    recentSpeeds.push(Math.max(0, mbps));
    if (recentSpeeds.length > SMOOTHING_SAMPLES) recentSpeeds.shift();
    const sortedSpeeds = [...recentSpeeds].sort((a, b) => a - b);
    const middle = Math.floor(sortedSpeeds.length / 2);
    const smoothedMbps =
      sortedSpeeds.length % 2
        ? sortedSpeeds[middle]
        : (sortedSpeeds[middle - 1] + sortedSpeeds[middle]) / 2;
    samples.push({
      t: Math.min(durationSeconds, now()),
      mbps: smoothedMbps,
    });
    draw();
  };

  const start = (): void => {
    samples.length = 0;
    recentSpeeds.length = 0;
    origin = performance.now();
    samples.push({ t: 0, mbps: 0 });
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
