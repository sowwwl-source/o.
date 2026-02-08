import type { DensityGrid, ZeroisoBuildResult, ZeroisoEngineConfig, ZeroisoFrame, ZeroisoMode, ZeroisoScanSlot } from "./types";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function hypot2(x: number, y: number) {
  return Math.hypot(x, y);
}

function hash32(s: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function defaultZeroisoConfig(): ZeroisoEngineConfig {
  return {
    grid: { w: 120, h: 80 },
    fps: 10,
    frames: 42,
    charset: {
      empty: " ",
      ramp: " .,:;i1tfLCG08@",
    },
    fragments: [
      "air",
      "nuage",
      "stream",
      "degres",
      "////",
      "o.",
      "0isO",
      "cloud",
      "soul",
    ],
  };
}

export function parseFragmentsInput(text: string): string[] {
  const raw = String(text || "")
    .replace(/\r\n/g, "\n")
    .split(/[\n,]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const s of raw) {
    const cleaned = s.replace(/\s+/g, " ").slice(0, 40);
    if (!cleaned) continue;
    if (!out.includes(cleaned)) out.push(cleaned);
    if (out.length >= 32) break;
  }
  return out;
}

function makeGrid(w: number, h: number): DensityGrid {
  return { w, h, data: new Float32Array(w * h) };
}

function idx(w: number, x: number, y: number) {
  return y * w + x;
}

function sampleGrid(g: DensityGrid, x: number, y: number): number {
  const xx = clamp(x, 0, g.w - 1);
  const yy = clamp(y, 0, g.h - 1);
  return g.data[idx(g.w, xx, yy)] ?? 0;
}

function gridStats(g: DensityGrid) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (let i = 0; i < g.data.length; i++) {
    const v = g.data[i] ?? 0;
    min = Math.min(min, v);
    max = Math.max(max, v);
    sum += v;
  }
  const mean = sum / Math.max(1, g.data.length);
  return { min, max, mean };
}

function normalizeGrid(g: DensityGrid): DensityGrid {
  const { min, max } = gridStats(g);
  const span = Math.max(1e-6, max - min);
  for (let i = 0; i < g.data.length; i++) g.data[i] = clamp((g.data[i]! - min) / span, 0, 1);
  return g;
}

function mixGrids(a: DensityGrid, b: DensityGrid, t: number): DensityGrid {
  if (a.w !== b.w || a.h !== b.h) throw new Error("grid size mismatch");
  const out = makeGrid(a.w, a.h);
  const tt = clamp(t, 0, 1);
  for (let i = 0; i < out.data.length; i++) out.data[i] = lerp(a.data[i]!, b.data[i]!, tt);
  return out;
}

function addGrid(out: DensityGrid, src: DensityGrid, k: number): DensityGrid {
  if (out.w !== src.w || out.h !== src.h) throw new Error("grid size mismatch");
  for (let i = 0; i < out.data.length; i++) out.data[i] = clamp(out.data[i]! + src.data[i]! * k, 0, 1);
  return out;
}

export function densityFromSeed(seed: string, w: number, h: number): DensityGrid {
  const rand = mulberry32(hash32(seed));
  const g = makeGrid(w, h);

  // Symmetry hints (evokes traits without explicit figurative rendering).
  const attractors: Array<{ x: number; y: number; s: number; a: number }> = [];
  const n = 4 + Math.floor(rand() * 4); // 4..7 (mirrored)
  for (let i = 0; i < n; i++) {
    const x = 0.18 + rand() * 0.22; // left half
    const y = 0.22 + rand() * 0.58;
    const s = 0.08 + rand() * 0.14;
    const a = 0.35 + rand() * 0.65;
    attractors.push({ x, y, s, a });
    attractors.push({ x: 1 - x, y, s: s * (0.95 + rand() * 0.1), a: a * (0.9 + rand() * 0.2) });
  }

  const center = { x: 0.5, y: 0.52 };
  const baseR = 0.78;
  const ang0 = (rand() * Math.PI * 2) / 1.6;

  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const u = (xx + 0.5) / w;
      const v = (yy + 0.5) / h;

      const dx = u - center.x;
      const dy = v - center.y;
      const r = hypot2(dx, dy);
      const fall = clamp(1 - r / baseR, 0, 1);

      let acc = fall * 0.42;

      for (const p of attractors) {
        const px = u - p.x;
        const py = v - p.y;
        const d2 = px * px + py * py;
        acc += p.a * Math.exp(-d2 / (p.s * p.s));
      }

      // anisotropic waves (break literal symmetry; keeps it alive)
      const wave =
        Math.sin((u * 3.2 + v * 2.1) * Math.PI * 2 + ang0) * 0.08 +
        Math.cos((u * 1.6 - v * 2.7) * Math.PI * 2 - ang0 * 0.7) * 0.06;
      acc += wave;

      // noise grain
      acc += (rand() - 0.5) * 0.06;

      g.data[idx(w, xx, yy)] = clamp(acc, 0, 1);
    }
  }

  return normalizeGrid(g);
}

export async function densityFromImageFile(file: File, w: number, h: number): Promise<DensityGrid> {
  const g = makeGrid(w, h);

  // Decode the file in memory (never attach an img tag to DOM).
  const bitmap = await createImageBitmap(file);
  try {
    const canvas: HTMLCanvasElement = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas 2d unavailable");

    // draw cover (preserve aspect, fill grid)
    ctx.clearRect(0, 0, w, h);
    const s = Math.max(w / Math.max(1, bitmap.width), h / Math.max(1, bitmap.height));
    const dw = bitmap.width * s;
    const dh = bitmap.height * s;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    ctx.drawImage(bitmap, dx, dy, dw, dh);

    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < w * h; i++) {
      const r = d[i * 4 + 0] ?? 0;
      const gch = d[i * 4 + 1] ?? 0;
      const b = d[i * 4 + 2] ?? 0;
      // luminance -> density (dark => denser)
      const l = (0.2126 * r + 0.7152 * gch + 0.0722 * b) / 255;
      const den = clamp(1 - l, 0, 1);
      g.data[i] = den;
    }
  } finally {
    try {
      (bitmap as any).close?.();
    } catch {}
  }

  // Destroy intermediates by scope; return only density.
  return normalizeGrid(g);
}

function pickRampChar(ramp: string, t01: number) {
  const r = ramp || " .";
  const k = clamp(t01, 0, 1);
  const i = Math.round(k * (r.length - 1));
  return r[i] ?? r[r.length - 1] ?? ".";
}

function buildPattern(seed: string, fragments: string[]): string {
  const base = fragments.length ? fragments.join(" ") : "0isO";
  const s = seed ? ` ${seed} ` : " ";
  return (base + s + "o. stream degres //// cloud ").replace(/\s+/g, " ").trim() + " ";
}

function rowMean(g: DensityGrid, y: number) {
  const yy = clamp(y, 0, g.h - 1);
  let sum = 0;
  for (let x = 0; x < g.w; x++) sum += g.data[idx(g.w, x, yy)] ?? 0;
  return sum / Math.max(1, g.w);
}

function gradientX(g: DensityGrid, x: number, y: number) {
  const a = sampleGrid(g, x - 1, y);
  const b = sampleGrid(g, x + 1, y);
  return b - a;
}

function gradientY(g: DensityGrid, x: number, y: number) {
  const a = sampleGrid(g, x, y - 1);
  const b = sampleGrid(g, x, y + 1);
  return b - a;
}

export function renderZeroisoAsciiFrame(opts: {
  grid: DensityGrid;
  seed: string;
  fragments: string[];
  charsetRamp: string;
  emptyChar: string;
  phase01: number;
  deg: number;
}): ZeroisoFrame {
  const { grid, seed, fragments, charsetRamp, emptyChar } = opts;
  const phase = clamp(opts.phase01, 0, 1);
  const deg = ((opts.deg % 360) + 360) % 360;

  const rand = mulberry32(hash32(`${seed}:${Math.floor(phase * 1000)}:${deg}`));
  const pattern = buildPattern(seed, fragments);
  const out: string[] = [];

  for (let y = 0; y < grid.h; y++) {
    const mean = rowMean(grid, y);
    const breathe = 0.08 * Math.sin((y / grid.h) * Math.PI * 2 + phase * Math.PI * 2);
    const inkBias = clamp(0.18 + mean * 0.65 + breathe, 0.08, 0.86);

    // slow "line drift" (resting micro-shift)
    const drift = Math.round(Math.sin(phase * Math.PI * 2 + y * 0.11) * (1 + mean * 3));
    const start = (hash32(`${seed}:${y}`) + Math.floor(phase * 10_000) + drift * 17) % Math.max(1, pattern.length);

    let line = "";
    for (let x = 0; x < grid.w; x++) {
      const d = grid.data[idx(grid.w, x, y)] ?? 0;
      const gx = gradientX(grid, x, y);
      const gy = gradientY(grid, x, y);
      const bend = Math.round((gx * 12 + gy * 6) * (0.6 + d));

      const noise = (rand() - 0.5) * 0.12;
      const ink = d + noise > inkBias;

      if (!ink) {
        const bg = d < 0.12 ? emptyChar : pickRampChar(charsetRamp, d * (0.75 + 0.25 * phase));
        line += bg;
        continue;
      }

      const pi = (start + x + bend + Math.floor(phase * 19) + (deg % 13)) % pattern.length;
      const ch = pattern[pi] ?? "o";
      line += ch === "\n" ? " " : ch;
    }
    out.push(line);
  }

  // Inject a subtle degrees trace (never a HUD; just matter).
  if (out.length) {
    const y = Math.floor(grid.h * 0.08);
    const line = out[y] ?? "";
    const token = `${deg}`.padStart(3, "0");
    const x0 = Math.floor(grid.w * 0.68);
    const arr = line.split("");
    for (let i = 0; i < token.length; i++) {
      const x = x0 + i;
      if (x >= 0 && x < arr.length) arr[x] = token[i]!;
    }
    out[y] = arr.join("");
  }

  return {
    text: out.join("\n"),
    meta: { kind: "mix", phase, deg },
  };
}

function buildTimeline(mode: ZeroisoMode, totalFrames: number) {
  const frames = Math.max(12, Math.min(60, Math.floor(totalFrames)));
  if (mode === 3) {
    const hold = Math.max(5, Math.floor(frames * 0.14));
    const trans = Math.max(6, Math.floor(frames * 0.19));
    const timeline: Array<{ a: ZeroisoScanSlot; b: ZeroisoScanSlot; t: number }> = [];

    const pushHold = (slot: ZeroisoScanSlot) => {
      for (let i = 0; i < hold; i++) timeline.push({ a: slot, b: slot, t: 0 });
    };
    const pushTrans = (from: ZeroisoScanSlot, to: ZeroisoScanSlot) => {
      for (let i = 0; i < trans; i++) timeline.push({ a: from, b: to, t: i / Math.max(1, trans - 1) });
    };

    pushHold("A");
    pushTrans("A", "B");
    pushHold("B");
    pushTrans("B", "C");
    pushHold("C");
    pushTrans("C", "A");

    while (timeline.length > frames) timeline.pop();
    while (timeline.length < frames) timeline.push({ a: "A", b: "A", t: 0 });
    return timeline;
  }

  const timeline: Array<{ a: ZeroisoScanSlot; b: ZeroisoScanSlot; t: number }> = [];
  for (let i = 0; i < frames; i++) timeline.push({ a: "A", b: "A", t: 0 });
  return timeline;
}

export async function buildZeroisoFrames(opts: {
  mode: ZeroisoMode;
  seed: string;
  config?: Partial<ZeroisoEngineConfig>;
  scans?: Partial<Record<ZeroisoScanSlot, DensityGrid>>;
  signal?: AbortSignal;
}): Promise<ZeroisoBuildResult> {
  const base = defaultZeroisoConfig();
  const cfg: ZeroisoEngineConfig = {
    ...base,
    ...opts.config,
    grid: { ...base.grid, ...(opts.config?.grid || {}) },
    charset: { ...base.charset, ...(opts.config?.charset || {}) },
    fragments: opts.config?.fragments ? [...opts.config.fragments] : [...base.fragments],
  };

  const { w, h } = cfg.grid;
  const seed = String(opts.seed || "").trim() || "0iso";

  const seedGrid = densityFromSeed(seed, w, h);
  const scanA = opts.scans?.A ?? seedGrid;
  const scanB = opts.scans?.B ?? scanA;
  const scanC = opts.scans?.C ?? scanA;

  // Mode 1: keep scan as primary, but fold seed as a soft signature layer.
  const primaryA = opts.mode === 1 ? addGrid(mixGrids(scanA, seedGrid, 0.22), seedGrid, 0.06) : scanA;
  const primaryB = opts.mode === 3 ? addGrid(mixGrids(scanB, seedGrid, 0.18), seedGrid, 0.05) : scanB;
  const primaryC = opts.mode === 3 ? addGrid(mixGrids(scanC, seedGrid, 0.18), seedGrid, 0.05) : scanC;

  const timeline = buildTimeline(opts.mode, cfg.frames);
  const frames: ZeroisoFrame[] = [];

  // Precompute with cooperative yielding (idle, then microtask).
  const idle = (globalThis as any).requestIdleCallback as undefined | ((cb: (d: { timeRemaining: () => number }) => void) => any);
  const yieldOnce = () =>
    new Promise<void>((resolve) => {
      if (idle) idle(() => resolve());
      else queueMicrotask(() => resolve());
    });

  for (let i = 0; i < timeline.length; i++) {
    if (opts.signal?.aborted) throw new Error("aborted");
    const seg = timeline[i]!;
    const phase = i / Math.max(1, timeline.length - 1);
    const deg = Math.round(phase * 360);

    const ga = seg.a === "A" ? primaryA : seg.a === "B" ? primaryB : primaryC;
    const gb = seg.b === "A" ? primaryA : seg.b === "B" ? primaryB : primaryC;
    const mixed = seg.a === seg.b ? ga : mixGrids(ga, gb, seg.t);

    // Subtle variation per-frame (resting motion lives in the field).
    const k = opts.mode === 0 ? 0.12 : opts.mode === 1 ? 0.08 : 0.06;
    const drift = densityFromSeed(`${seed}:${i}`, w, h);
    const g = addGrid(mixGrids(mixed, drift, k), seedGrid, 0.02);

    frames.push(
      renderZeroisoAsciiFrame({
        grid: g,
        seed,
        fragments: cfg.fragments,
        charsetRamp: cfg.charset.ramp,
        emptyChar: cfg.charset.empty,
        phase01: phase,
        deg,
      })
    );

    if (i % 4 === 3) await yieldOnce();
  }

  return {
    mode: opts.mode,
    seed,
    grid: { w, h },
    fps: cfg.fps,
    frames,
  };
}
