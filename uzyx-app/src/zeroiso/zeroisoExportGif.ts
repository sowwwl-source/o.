import type { ZeroisoFrame } from "./types";

type RGB = { r: number; g: number; b: number };

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function parseHexColor(input: string): RGB | null {
  const s = String(input || "").trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(s);
  if (!m) return null;
  const hex = m[1]!;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return { r, g, b };
}

function sq(n: number) {
  return n * n;
}

function dist2(a: RGB, r: number, g: number, b: number) {
  return sq(a.r - r) + sq(a.g - g) + sq(a.b - b);
}

function u16le(n: number) {
  const v = n & 0xffff;
  return [v & 0xff, (v >>> 8) & 0xff];
}

class ByteWriter {
  private parts: number[] = [];
  push(...bytes: number[]) {
    this.parts.push(...bytes.map((b) => b & 0xff));
  }
  pushStr(s: string) {
    for (let i = 0; i < s.length; i++) this.parts.push(s.charCodeAt(i) & 0xff);
  }
  toU8() {
    return new Uint8Array(this.parts);
  }
}

class BitWriter {
  private out: number[] = [];
  private cur = 0;
  private bits = 0;
  write(code: number, size: number) {
    let c = code >>> 0;
    let n = size >>> 0;
    while (n > 0) {
      this.cur |= (c & 1) << this.bits;
      c >>>= 1;
      this.bits++;
      if (this.bits === 8) {
        this.out.push(this.cur & 0xff);
        this.cur = 0;
        this.bits = 0;
      }
      n--;
    }
  }
  finish(): Uint8Array {
    if (this.bits > 0) this.out.push(this.cur & 0xff);
    return new Uint8Array(this.out);
  }
}

function lzwCompress(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const clear = 1 << minCodeSize;
  const end = clear + 1;

  let codeSize = minCodeSize + 1;
  let nextCode = end + 1;

  const dict = new Map<string, number>();
  const reset = () => {
    dict.clear();
    codeSize = minCodeSize + 1;
    nextCode = end + 1;
  };

  reset();

  const bw = new BitWriter();
  bw.write(clear, codeSize);

  let prefix = String(indices[0] ?? 0);

  for (let i = 1; i < indices.length; i++) {
    const k = indices[i] ?? 0;
    const key = prefix + "," + k;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = key;
      continue;
    }

    // output prefix code
    const outCode = prefix.includes(",") ? dict.get(prefix) : parseInt(prefix, 10);
    bw.write(outCode ?? 0, codeSize);

    // add key
    dict.set(key, nextCode++);
    prefix = String(k);

    if (nextCode === (1 << codeSize) && codeSize < 12) {
      codeSize++;
    } else if (nextCode >= 4096) {
      bw.write(clear, codeSize);
      reset();
      bw.write(clear, codeSize);
    }
  }

  const lastCode = prefix.includes(",") ? dict.get(prefix) : parseInt(prefix, 10);
  bw.write(lastCode ?? 0, codeSize);
  bw.write(end, codeSize);

  return bw.finish();
}

function toSubBlocks(bytes: Uint8Array): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const n = Math.min(255, bytes.length - i);
    out.push(n);
    for (let j = 0; j < n; j++) out.push(bytes[i + j] ?? 0);
    i += n;
  }
  out.push(0); // terminator
  return out;
}

function encodeGif(opts: {
  w: number;
  h: number;
  frames: Uint8Array[];
  delayCs: number;
  loop: number;
  bg: RGB;
  fg: RGB;
}): Uint8Array {
  const { w, h, frames, delayCs, loop, bg, fg } = opts;
  const bw = new ByteWriter();

  bw.pushStr("GIF89a");
  bw.push(...u16le(w), ...u16le(h));

  const gctFlag = 1 << 7;
  const colorRes = 7 << 4; // 8-bit
  const sort = 0 << 3;
  const gctSize = 0; // 2 colors
  bw.push(gctFlag | colorRes | sort | gctSize);
  bw.push(0); // bg index
  bw.push(0); // aspect

  // Global color table (2 colors): bg then fg.
  bw.push(bg.r, bg.g, bg.b, fg.r, fg.g, fg.b);

  // Netscape loop extension
  bw.push(0x21, 0xff, 0x0b);
  bw.pushStr("NETSCAPE2.0");
  bw.push(0x03, 0x01, ...u16le(loop), 0x00);

  const minCodeSize = 2;
  const delay = clamp(Math.round(delayCs), 1, 65535);

  for (const frame of frames) {
    // Graphic Control Extension
    bw.push(0x21, 0xf9, 0x04);
    bw.push(0x04); // disposal=1, no transparency
    bw.push(...u16le(delay));
    bw.push(0x00); // transparent index
    bw.push(0x00); // terminator

    // Image descriptor
    bw.push(0x2c);
    bw.push(...u16le(0), ...u16le(0), ...u16le(w), ...u16le(h));
    bw.push(0x00); // no local color table

    // Image data
    bw.push(minCodeSize);
    const lzw = lzwCompress(frame, minCodeSize);
    bw.push(...toSubBlocks(lzw));
  }

  bw.push(0x3b); // trailer
  return bw.toU8();
}

function canUseCanvas(): boolean {
  if (typeof document === "undefined" || typeof (document as any).createElement !== "function") return false;
  if (typeof (globalThis as any).CanvasRenderingContext2D === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return Boolean((c as any).getContext?.("2d"));
  } catch {
    return false;
  }
}

function rasterizeAsciiFallback(frameText: string, bg: RGB, fg: RGB, scale = 2): { w: number; h: number; indices: Uint8Array } {
  const lines = String(frameText || "").split("\n");
  const hChars = lines.length;
  const wChars = Math.max(0, ...lines.map((l) => l.length));
  const w = Math.max(1, wChars * scale);
  const h = Math.max(1, hChars * scale);
  const indices = new Uint8Array(w * h);
  indices.fill(0);

  for (let y = 0; y < hChars; y++) {
    const line = lines[y] ?? "";
    for (let x = 0; x < wChars; x++) {
      const ch = line[x] ?? " ";
      if (ch === " " || ch === "\t") continue;
      for (let yy = 0; yy < scale; yy++) {
        for (let xx = 0; xx < scale; xx++) {
          const px = x * scale + xx;
          const py = y * scale + yy;
          indices[py * w + px] = 1;
        }
      }
    }
  }

  // bg/fg only, kept for signature; colors are set at gif encode stage.
  void bg;
  void fg;

  return { w, h, indices };
}

function rasterizeAsciiCanvas(frameText: string, colors: { bg: RGB; fg: RGB }, opts?: { fontPx?: number; linePx?: number; padPx?: number }) {
  const lines = String(frameText || "").split("\n");
  const pad = Math.max(0, Math.floor(opts?.padPx ?? 4));
  const fontPx = Math.max(6, Math.floor(opts?.fontPx ?? 10));
  const linePx = Math.max(fontPx + 1, Math.floor(opts?.linePx ?? Math.round(fontPx * 1.15)));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas 2d unavailable");

  ctx.font = `${fontPx}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`;
  ctx.textBaseline = "top";

  const wChars = Math.max(0, ...lines.map((l) => l.length));
  const cw = Math.max(1, Math.ceil(ctx.measureText("M").width));
  const w = Math.max(1, pad * 2 + wChars * cw);
  const h = Math.max(1, pad * 2 + lines.length * linePx);

  canvas.width = w;
  canvas.height = h;

  // draw bg + fg text (never displayed in DOM)
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = `rgb(${colors.bg.r},${colors.bg.g},${colors.bg.b})`;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = `rgb(${colors.fg.r},${colors.fg.g},${colors.fg.b})`;
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i] ?? "", pad, pad + i * linePx);

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const indices = new Uint8Array(w * h);

  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4 + 0] ?? 0;
    const g = d[i * 4 + 1] ?? 0;
    const b = d[i * 4 + 2] ?? 0;
    const a = d[i * 4 + 3] ?? 255;
    if (a < 10) {
      indices[i] = 0;
      continue;
    }
    const bgD = dist2(colors.bg, r, g, b);
    const fgD = dist2(colors.fg, r, g, b);
    indices[i] = fgD <= bgD ? 1 : 0;
  }

  return { w, h, indices };
}

export async function exportZeroisoGif(opts: {
  frames: Array<Pick<ZeroisoFrame, "text">>;
  fps: number;
  bg: string;
  fg: string;
  loop?: number;
  canvasText?: { fontPx?: number; linePx?: number; padPx?: number };
}): Promise<{ blob: Blob; bytes: Uint8Array; frames: number; fps: number; w: number; h: number }> {
  const bg = parseHexColor(opts.bg) ?? { r: 11, g: 13, b: 15 };
  const fg = parseHexColor(opts.fg) ?? { r: 231, g: 231, b: 231 };
  const fps = clamp(opts.fps || 10, 1, 24);
  const delayCs = Math.round(100 / fps);
  const loop = typeof opts.loop === "number" ? clamp(opts.loop, 0, 65535) : 0;

  const frameTexts = opts.frames.map((f) => String(f.text || ""));
  if (!frameTexts.length) throw new Error("no frames");

  const raster = (t: string) => {
    if (canUseCanvas()) return rasterizeAsciiCanvas(t, { bg, fg }, opts.canvasText);
    return rasterizeAsciiFallback(t, bg, fg, 2);
  };

  const first = raster(frameTexts[0]!);
  const w = first.w;
  const h = first.h;
  const frames: Uint8Array[] = [];
  frames.push(first.indices);

  for (let i = 1; i < frameTexts.length; i++) {
    const r = raster(frameTexts[i]!);
    if (r.w !== w || r.h !== h) throw new Error("frame size mismatch");
    frames.push(r.indices);
  }

  const bytes = encodeGif({ w, h, frames, delayCs, loop, bg, fg });
  const blob = new Blob([bytes as unknown as BlobPart], { type: "image/gif" });
  return { blob, bytes, frames: frames.length, fps, w, h };
}
