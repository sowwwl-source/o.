import { computeBlurLayers, blurModes, type BlurModeId } from "./blurModes";
import { computeFocusPhi, type FocusPhi } from "./focusPhi";

export type PerceptionProfileId = "board" | "deltaZ" | "stream" | "land" | "ferry";

export type PerceptionNode = {
  id: string;
  /** normalized 0..1 */
  x: number;
  /** normalized 0..1 */
  y: number;
};

export type NodeMatter = {
  warpPx: { x: number; y: number };
  typo: {
    scaleX: number;
    scaleY: number;
    skewDeg: number;
  };
  blur: {
    orient: number;
    depth: number;
    threshold: number;
    ox: number;
    oy: number;
  };
  misalign: number;
  depthIndex: number;
};

export type PerceptionFrame = {
  baseProfile: Exclude<PerceptionProfileId, "deltaZ">;
  stateBlend: number;
  reducedMotion: boolean;
  focus: FocusPhi;
  pointer: { x: number; y: number; vx: number; vy: number; speed: number };
  dir: { x: number; y: number };
  nodes: Record<string, NodeMatter>;
  exitDeltaZ: boolean;
};

type Profile = {
  id: PerceptionProfileId;
  tauPointer: number;
  tauFocus: number;
  tauBlend: number;
  warpStrengthPx: number;
  warpSigma: number;
  warpTimeScale: number;
  warpVScale: number;
  maxSkewDeg: number;
  maxScaleX: number;
  maxScaleY: number;
  blurMode: BlurModeId;
};

const PROFILES: Record<PerceptionProfileId, Profile> = {
  board: {
    id: "board",
    tauPointer: 0.09,
    tauFocus: 0.12,
    tauBlend: 0.28,
    warpStrengthPx: 7,
    warpSigma: 0.32,
    warpTimeScale: 0.85,
    warpVScale: 0.85,
    maxSkewDeg: 6,
    maxScaleX: 0.09,
    maxScaleY: 0.05,
    blurMode: "board",
  },
  ferry: {
    id: "ferry",
    tauPointer: 0.1,
    tauFocus: 0.12,
    tauBlend: 0.3,
    warpStrengthPx: 9,
    warpSigma: 0.28,
    warpTimeScale: 0.95,
    warpVScale: 0.95,
    maxSkewDeg: 7,
    maxScaleX: 0.11,
    maxScaleY: 0.06,
    blurMode: "ferry",
  },
  deltaZ: {
    id: "deltaZ",
    tauPointer: 0.18,
    tauFocus: 0.16,
    tauBlend: 0.34,
    warpStrengthPx: 18,
    warpSigma: 0.24,
    warpTimeScale: 1.05,
    warpVScale: 1.25,
    maxSkewDeg: 12,
    maxScaleX: 0.16,
    maxScaleY: 0.08,
    blurMode: "deltaZ",
  },
  stream: {
    id: "stream",
    tauPointer: 0.11,
    tauFocus: 0.12,
    tauBlend: 0.3,
    warpStrengthPx: 14,
    warpSigma: 0.22,
    warpTimeScale: 1.4,
    warpVScale: 1.05,
    maxSkewDeg: 9,
    maxScaleX: 0.14,
    maxScaleY: 0.07,
    blurMode: "stream",
  },
  land: {
    id: "land",
    tauPointer: 0.07,
    tauFocus: 0.08,
    tauBlend: 0.26,
    warpStrengthPx: 4,
    warpSigma: 0.34,
    warpTimeScale: 0.7,
    warpVScale: 0.6,
    maxSkewDeg: 4,
    maxScaleX: 0.05,
    maxScaleY: 0.03,
    blurMode: "land",
  },
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function hypot2(x: number, y: number) {
  return Math.hypot(x, y);
}

function norm(v: { x: number; y: number }) {
  const m = hypot2(v.x, v.y);
  if (m <= 1e-8) return { x: 0, y: 0, m: 0 };
  return { x: v.x / m, y: v.y / m, m };
}

function dot(a: { x: number; y: number }, b: { x: number; y: number }) {
  return a.x * b.x + a.y * b.y;
}

// smoothing exponentiel
function smooth(curr: number, target: number, dt: number, tau: number) {
  const a = 1 - Math.exp(-dt / tau);
  return curr + (target - curr) * a;
}

// warp field (concept)
function falloff(u: { x: number; y: number }, p: { x: number; y: number }, sigma: number) {
  const dx = u.x - p.x,
    dy = u.y - p.y;
  return Math.exp(-(dx * dx + dy * dy) / (sigma * sigma));
}
function field(u: { x: number; y: number }, t: number, focus: { x: number; y: number }, v: { x: number; y: number }) {
  // wave + shear orienté
  // return {dx,dy}
  const center = { x: 0.5, y: 0.5 };
  const vN = norm(v);
  const fDirN = norm({ x: focus.x - center.x, y: focus.y - center.y });
  const dir = vN.m > 0.12 ? { x: vN.x, y: vN.y } : fDirN.m > 0.01 ? { x: fDirN.x, y: fDirN.y } : { x: 0, y: -1 };
  const perp = { x: -dir.y, y: dir.x };

  const fx = u.x - focus.x;
  const fy = u.y - focus.y;
  const along = fx * dir.x + fy * dir.y;
  const across = fx * perp.x + fy * perp.y;

  const wave = Math.sin((u.x * 8.4 + u.y * 6.2) * Math.PI * 2 + t * 1.4);
  const ripple = Math.cos((along * 10.2 + across * 4.6) * Math.PI * 2 - t * 1.05);
  const shear = clamp(along, -0.6, 0.6);

  const w = wave * 0.55 + ripple * 0.45;
  const sx = dir.x * shear + perp.x * across;
  const sy = dir.y * shear + perp.y * across;

  return {
    dx: perp.x * w * 0.75 + sx * 0.35,
    dy: perp.y * w * 0.75 + sy * 0.35,
  };
}

export class PerceptionEngine {
  private baseProfile: Exclude<PerceptionProfileId, "deltaZ"> = "board";
  private deltaZTarget = false;
  private reducedMotion = false;

  private viewport = { w: 1, h: 1, min: 1 };

  private tPrev = 0;
  private pointerTarget = { x: 0.5, y: 0.5 };
  private pointer = { x: 0.5, y: 0.5 };
  private pointerPrev = { x: 0.5, y: 0.5 };
  private velocity = { x: 0, y: 0 };
  private dirPrev = { x: 0, y: -1 };
  private velDirPrev = { x: 0, y: -1 };

  private focus: FocusPhi = { id: "HAUT", fx: 0.5, fy: 0.5, weight: 0 };
  private focusPrevId: string | undefined;

  private stateBlend = 0;
  private exitCenterMs = 0;
  private exitDisorientMs = 0;
  private dzLeftCenter = false;

  setViewport(next: { w: number; h: number }): void {
    const w = Math.max(1, next.w);
    const h = Math.max(1, next.h);
    this.viewport = { w, h, min: Math.max(1, Math.min(w, h)) };
  }

  setReducedMotion(next: boolean): void {
    this.reducedMotion = next;
  }

  setBaseProfile(next: Exclude<PerceptionProfileId, "deltaZ">): void {
    this.baseProfile = next;
  }

  setDeltaZTarget(next: boolean): void {
    this.deltaZTarget = next;
  }

  setPointerTarget(next: { x: number; y: number }): void {
    this.pointerTarget = { x: clamp(next.x, 0, 1), y: clamp(next.y, 0, 1) };
  }

  getStateBlend(): number {
    return this.stateBlend;
  }

  step(nowMs: number, nodes: PerceptionNode[]): PerceptionFrame {
    const now = nowMs / 1000;
    const dt = this.tPrev > 0 ? clamp(now - this.tPrev, 1 / 240, 1 / 18) : 1 / 60;
    this.tPrev = now;

    const base = PROFILES[this.baseProfile];
    const dz = PROFILES.deltaZ;
    const targetBlend = this.deltaZTarget ? 1 : 0;
    const tauBlend = this.reducedMotion ? 0.02 : lerp(base.tauBlend, dz.tauBlend, this.stateBlend);
    this.stateBlend = clamp(smooth(this.stateBlend, targetBlend, dt, tauBlend), 0, 1);

    const blend = this.stateBlend;
    const tauPointer = this.reducedMotion ? 0.01 : lerp(base.tauPointer, dz.tauPointer, blend);
    const tauFocus = this.reducedMotion ? 0.01 : lerp(base.tauFocus, dz.tauFocus, blend);

    // Pointer inertia in normalized space (0..1).
    this.pointer.x = smooth(this.pointer.x, this.pointerTarget.x, dt, Math.max(1e-4, tauPointer));
    this.pointer.y = smooth(this.pointer.y, this.pointerTarget.y, dt, Math.max(1e-4, tauPointer));

    const vx = (this.pointer.x - this.pointerPrev.x) / dt;
    const vy = (this.pointer.y - this.pointerPrev.y) / dt;
    this.pointerPrev = { x: this.pointer.x, y: this.pointer.y };
    this.velocity = { x: vx, y: vy };

    const speedNorm = hypot2(vx, vy);
    const speedPx = speedNorm * this.viewport.min;
    const speed01 = clamp(speedPx / 1100, 0, 1);

    // Focus Φ (node selection without reticle).
    const f = computeFocusPhi(nodes, this.pointer, this.focusPrevId);
    this.focusPrevId = f.id;
    this.focus = {
      id: f.id,
      fx: smooth(this.focus.fx, f.fx, dt, Math.max(1e-4, tauFocus)),
      fy: smooth(this.focus.fy, f.fy, dt, Math.max(1e-4, tauFocus)),
      weight: smooth(this.focus.weight, f.weight, dt, Math.max(1e-4, tauFocus)),
    };

    const center = { x: 0.5, y: 0.5 };
    const focusDirN = norm({ x: this.focus.fx - center.x, y: this.focus.fy - center.y });
    const velDirN = norm(this.velocity);
    const dir = velDirN.m > 0.08 ? { x: velDirN.x, y: velDirN.y } : focusDirN.m > 0.01 ? { x: focusDirN.x, y: focusDirN.y } : this.dirPrev;
    this.dirPrev = dir;

    const modeBase = blurModes[base.blurMode];
    const modeDz = blurModes[dz.blurMode];

    const warpStrength = (this.reducedMotion ? 0.14 : 1) * lerp(base.warpStrengthPx, dz.warpStrengthPx, blend);
    const warpSigma = lerp(base.warpSigma, dz.warpSigma, blend);
    const warpTimeScale = lerp(base.warpTimeScale, dz.warpTimeScale, blend);
    const warpVScale = lerp(base.warpVScale, dz.warpVScale, blend);

    const maxSkewDeg = lerp(base.maxSkewDeg, dz.maxSkewDeg, blend) * (this.reducedMotion ? 0.25 : 1);
    const maxScaleX = lerp(base.maxScaleX, dz.maxScaleX, blend) * (this.reducedMotion ? 0.3 : 1);
    const maxScaleY = lerp(base.maxScaleY, dz.maxScaleY, blend) * (this.reducedMotion ? 0.3 : 1);

    const focusWeight = clamp(this.focus.weight, 0, 1);
    const pCenter = hypot2(this.pointer.x - center.x, this.pointer.y - center.y);
    const centerCalm = clamp(1 - pCenter / 0.14, 0, 1);
    const calm = clamp(focusWeight * 0.85 + centerCalm * 0.65, 0, 1);
    const instability = 1 - calm;

    const neutral = (u: { x: number; y: number }) => 1 - falloff(u, center, 0.19);

    const out: Record<string, NodeMatter> = {};
    for (const n of nodes) {
      const pos = { x: clamp(n.x, 0, 1), y: clamp(n.y, 0, 1) };
      const nDir = norm({ x: pos.x - center.x, y: pos.y - center.y });
      const align = focusDirN.m > 0.01 && nDir.m > 0.01 ? clamp(dot({ x: focusDirN.x, y: focusDirN.y }, { x: nDir.x, y: nDir.y }), -1, 1) : 1;
      const depthIndex = clamp((align + 1) / 2, 0, 1);
      const misalign = clamp(1 - depthIndex, 0, 1);

      const d = clamp(misalign * 0.62 + instability * 0.52, 0, 1);

      const baseLayers = computeBlurLayers(modeBase, { d, s: speed01, depthIndex, focusWeight, tt: 0, reducedMotion: this.reducedMotion });
      const dzLayers = computeBlurLayers(modeDz, { d, s: speed01, depthIndex, focusWeight, tt: blend, reducedMotion: this.reducedMotion });

      const blur = {
        orient: lerp(baseLayers.orient, dzLayers.orient, blend),
        depth: lerp(baseLayers.depth, dzLayers.depth, blend),
        threshold: dzLayers.threshold,
      };

      const blurOffset = (blur.orient || 0) * 0.85;
      const ox = dir.x * blurOffset;
      const oy = dir.y * blurOffset;

      const cross = focusDirN.m > 0.01 && nDir.m > 0.01 ? focusDirN.x * nDir.y - focusDirN.y * nDir.x : 0;
      const sign = cross >= 0 ? 1 : -1;
      const amp = clamp(0.35 + 0.65 * instability + 0.25 * speed01, 0.25, 1);
      const skewDeg = sign * misalign * maxSkewDeg * amp;
      const scaleX = 1 + misalign * maxScaleX * amp;
      const scaleY = 1 - misalign * maxScaleY * amp;

      // Warp (neutral around HAUT; stronger away from center and when unstable).
      const fF = falloff(pos, { x: this.focus.fx, y: this.focus.fy }, warpSigma);
      const k = clamp(0.32 + 0.68 * instability, 0.22, 1);
      const disp = field(pos, now * warpTimeScale, { x: this.focus.fx, y: this.focus.fy }, { x: vx * warpVScale, y: vy * warpVScale });
      const warpK = warpStrength * fF * neutral(pos) * k;
      const warpPx = {
        x: clamp(disp.dx * warpK, -warpStrength * 1.2, warpStrength * 1.2),
        y: clamp(disp.dy * warpK, -warpStrength * 1.2, warpStrength * 1.2),
      };

      out[n.id] = {
        warpPx,
        typo: {
          scaleX: clamp(scaleX, 0.86, 1.22),
          scaleY: clamp(scaleY, 0.78, 1.22),
          skewDeg: clamp(skewDeg, -18, 18),
        },
        blur: {
          orient: blur.orient,
          depth: blur.depth,
          threshold: blur.threshold,
          ox,
          oy,
        },
        misalign,
        depthIndex,
      };
    }

    // Exit rules (ΔZ′): return to center (calm) OR deliberate disorientation.
    let exitDeltaZ = false;
    if (blend > 0.55) {
      if (pCenter > 0.12) this.dzLeftCenter = true;
      const nearCenter = pCenter < 0.075;
      const slow = speedPx < 260;

      if (this.dzLeftCenter && nearCenter && slow) this.exitCenterMs += dt * 1000;
      else this.exitCenterMs = 0;

      // Disorientation: fast + sharp reversals (avoids accidental straight swipes).
      const vDir = velDirN.m > 0.06 ? { x: velDirN.x, y: velDirN.y } : this.velDirPrev;
      const reversal = dot(vDir, this.velDirPrev) < -0.55;
      const fast = speedPx > 880;
      if (fast && reversal) this.exitDisorientMs += dt * 1000;
      else this.exitDisorientMs = 0;

      if (this.exitCenterMs >= 380 || this.exitDisorientMs >= 140) exitDeltaZ = true;
    } else {
      this.exitCenterMs = 0;
      this.exitDisorientMs = 0;
      if (blend < 0.45) this.dzLeftCenter = false;
    }

    if (velDirN.m > 0.06) this.velDirPrev = { x: velDirN.x, y: velDirN.y };

    return {
      baseProfile: this.baseProfile,
      stateBlend: blend,
      reducedMotion: this.reducedMotion,
      focus: this.focus,
      pointer: { x: this.pointer.x, y: this.pointer.y, vx, vy, speed: speedPx },
      dir,
      nodes: out,
      exitDeltaZ,
    };
  }

  drawWarpCanvas(
    ctx: CanvasRenderingContext2D,
    frame: PerceptionFrame,
    opts: { fg: string; halo: string; w: number; h: number; dpr: number }
  ): void {
    const { w, h, dpr } = opts;
    if (w <= 2 || h <= 2) return;

    const min = Math.max(1, Math.min(w, h));
    const blend = frame.stateBlend;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const center = { x: w / 2, y: h / 2 };
    const focus = { x: frame.focus.fx * w, y: frame.focus.fy * h };
    const dir = frame.dir;

    const base = PROFILES[frame.baseProfile];
    const dz = PROFILES.deltaZ;
    const warpStrength = (frame.reducedMotion ? 0.14 : 1) * lerp(base.warpStrengthPx, dz.warpStrengthPx, blend);
    const warpSigma = lerp(base.warpSigma, dz.warpSigma, blend);
    const warpTimeScale = lerp(base.warpTimeScale, dz.warpTimeScale, blend);
    const warpVScale = lerp(base.warpVScale, dz.warpVScale, blend);

    const vx = frame.pointer.vx;
    const vy = frame.pointer.vy;

    const speed01 = clamp(frame.pointer.speed / 1100, 0, 1);
    const calm = clamp(frame.focus.weight, 0, 1);
    const instability = 1 - calm;

    // Canvas "matter" intensity per profile.
    const alphaBase =
      frame.baseProfile === "land" ? 0.05 : frame.baseProfile === "stream" ? 0.07 : frame.baseProfile === "ferry" ? 0.06 : 0.055;
    const alphaDz = 0.09;
    const alpha = lerp(alphaBase, alphaDz, blend);

    const step = frame.reducedMotion ? 34 : 24;
    const len = frame.reducedMotion ? 9 : 12;
    const sigmaPx = warpSigma * min;

    const drawPass = (k: number, blurK: number, color: string) => {
      ctx.globalAlpha = alpha * k;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.lineCap = "square";

      const ox = dir.x * blurK;
      const oy = dir.y * blurK;

      for (let yy = -step; yy < h + step; yy += step) {
        for (let xx = -step; xx < w + step; xx += step) {
          const tSec =
            ("performance" in globalThis && typeof (globalThis as any).performance?.now === "function"
              ? (globalThis as any).performance.now()
              : Date.now()) / 1000;
          const u = { x: xx / w, y: yy / h };
          const fF = falloff(u, { x: frame.focus.fx, y: frame.focus.fy }, warpSigma);
          const neutralK = 1 - falloff(u, { x: 0.5, y: 0.5 }, 0.19);
          const disp = field(u, tSec * warpTimeScale, { x: frame.focus.fx, y: frame.focus.fy }, { x: vx * warpVScale, y: vy * warpVScale });
          const warpK = warpStrength * fF * neutralK * clamp(0.32 + 0.68 * instability, 0.22, 1);
          const dx = disp.dx * warpK;
          const dy = disp.dy * warpK;

          const px = xx + dx + ox;
          const py = yy + dy + oy;

          // Small diagonal slash, slightly "bent" by focus proximity.
          const near = hypot2(px - focus.x, py - focus.y);
          const bend = clamp(1 - near / (sigmaPx * 0.95), 0, 1);
          const ang = (135 + bend * 24 * (instability - 0.35)) * (Math.PI / 180);
          const dx2 = Math.cos(ang) * len;
          const dy2 = Math.sin(ang) * len;

          ctx.beginPath();
          ctx.moveTo(px - dx2 * 0.5, py - dy2 * 0.5);
          ctx.lineTo(px + dx2 * 0.5, py + dy2 * 0.5);
          ctx.stroke();
        }
      }
    };

    // Orient blur: draw a couple passes along direction.
    const orient = clamp(lerp(0.4, 1.1, blend) * (0.2 + 0.8 * instability) + speed01 * 0.65, 0, 2.2);
    drawPass(1, 0, opts.fg);
    if (!frame.reducedMotion && orient > 0.25) {
      drawPass(0.55, orient * 2.2, opts.fg);
      drawPass(0.32, -orient * 1.6, opts.fg);
    }

    // Threshold: brief halo at the ΔZ′ passage.
    const peak = computeBlurLayers(blurModes.deltaZ, { d: 1 - calm, s: speed01, depthIndex: 1, focusWeight: calm, tt: blend, reducedMotion: frame.reducedMotion }).threshold;
    if (peak > 0.2) {
      ctx.globalCompositeOperation = "lighter";
      ctx.filter = `blur(${clamp(peak, 0, 4)}px)`;
      drawPass(0.18, 0, opts.halo);
      ctx.filter = "none";
      ctx.globalCompositeOperation = "source-over";
    }

    // Subtle vignette in ΔZ′ (no UI, just matter).
    const vignette = clamp(lerp(0, 0.14, blend) * (0.3 + 0.7 * instability), 0, 0.22);
    if (vignette > 0.01) {
      const g = ctx.createRadialGradient(center.x, center.y, min * 0.15, center.x, center.y, min * 0.62);
      g.addColorStop(0, "transparent");
      g.addColorStop(1, opts.fg);
      ctx.globalAlpha = vignette;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }
}
