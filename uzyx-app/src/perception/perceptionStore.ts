import { computeConstellation, type NodeId } from "@/graph/graph";
import { PerceptionEngine, type PerceptionFrame, type PerceptionNode } from "./PerceptionEngine";

export type BaseProfile = PerceptionFrame["baseProfile"];

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function getReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  const m = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  return Boolean(m?.matches);
}

function pickViewport() {
  const w = typeof window !== "undefined" ? window.innerWidth : 1;
  const h = typeof window !== "undefined" ? window.innerHeight : 1;
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}

type Listener = () => void;

const NODES: readonly NodeId[] = ["HAUT", "LAND", "FERRY", "STR3M", "CONTACT"];

export class PerceptionStore {
  private engine = new PerceptionEngine();
  private listeners = new Set<Listener>();

  private baseProfile: BaseProfile = "board";
  private deltaZTarget = false;
  private reducedMotion = false;

  private viewport = { w: 1, h: 1 };
  private pointer = { x: 0.5, y: 0.5 };

  private nodes: PerceptionNode[] = [];
  private frame: PerceptionFrame | null = null;

  private running = false;
  private raf: number | null = null;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private dpr = 1;

  private fg = "#e7e7e7";
  private halo = "rgba(255,180,90,.35)";
  private invertObs: MutationObserver | null = null;
  private cleanup: (() => void) | null = null;

  constructor() {
    const positions = computeConstellation(7);
    this.nodes = NODES.map((id) => ({
      id,
      x: positions[id].x / 100,
      y: positions[id].y / 100,
    })) satisfies PerceptionNode[];
  }

  private onPointer = (e: PointerEvent) => {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const x = clamp(e.clientX / w, 0, 1);
    const y = clamp(e.clientY / h, 0, 1);
    this.pointer = { x, y };
    this.engine.setPointerTarget(this.pointer);
  };

  private updateColors() {
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const fg = cs.getPropertyValue("--fg").trim();
    const halo = cs.getPropertyValue("--halo").trim();
    if (fg) this.fg = fg;
    if (halo) this.halo = halo;
  }

  private setViewport(v: { w: number; h: number }) {
    this.viewport = { w: Math.max(1, v.w), h: Math.max(1, v.h) };
    this.engine.setViewport(this.viewport);
    this.resizeCanvas();
  }

  private resizeCanvas() {
    const c = this.canvas;
    if (!c || !this.ctx) return;
    const { w, h } = this.viewport;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    this.dpr = dpr;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    c.style.width = "100%";
    c.style.height = "100%";
  }

  private tick = (now: number) => {
    if (!this.running) return;

    this.engine.setReducedMotion(this.reducedMotion);
    this.engine.setBaseProfile(this.baseProfile);
    this.engine.setDeltaZTarget(this.deltaZTarget);

    const next = this.engine.step(now, this.nodes);
    this.frame = next;

    const root = document.documentElement;
    root.style.setProperty("--state-blend", String(next.stateBlend.toFixed(3)));

    if (next.exitDeltaZ && this.deltaZTarget) this.deltaZTarget = false;

    if (this.ctx && !this.reducedMotion) {
      this.engine.drawWarpCanvas(this.ctx, next, {
        fg: this.fg,
        halo: this.halo,
        w: this.viewport.w,
        h: this.viewport.h,
        dpr: this.dpr,
      });
    } else if (this.ctx) {
      // Reduced motion: keep canvas empty.
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.ctx.clearRect(0, 0, this.viewport.w, this.viewport.h);
    }

    this.listeners.forEach((l) => l());
    this.raf = window.requestAnimationFrame(this.tick);
  };

  start(): void {
    if (this.running || typeof window === "undefined") return;
    this.running = true;

    // Reduced motion + updates.
    this.reducedMotion = getReducedMotion();
    const m = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onRM = () => (this.reducedMotion = getReducedMotion());
    if (m) {
      if ("addEventListener" in m) m.addEventListener("change", onRM);
      else (m as any).addListener(onRM);
    }

    // Pointer inertia target.
    window.addEventListener("pointermove", this.onPointer, { passive: true });
    window.addEventListener("pointerdown", this.onPointer, { passive: true });

    // Viewport.
    this.setViewport(pickViewport());
    const onResize = () => this.setViewport(pickViewport());
    window.addEventListener("resize", onResize, { passive: true });

    // Colors (fg/halo) update on invert.
    this.updateColors();
    this.invertObs = new MutationObserver(() => this.updateColors());
    this.invertObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-invert"] });

    // Start loop.
    this.raf = window.requestAnimationFrame(this.tick);

    this.cleanup = () => {
      if (!this.running) return;
      this.running = false;

      if (this.raf !== null) window.cancelAnimationFrame(this.raf);
      this.raf = null;

      window.removeEventListener("pointermove", this.onPointer as any);
      window.removeEventListener("pointerdown", this.onPointer as any);
      window.removeEventListener("resize", onResize as any);

      if (m) {
        if ("removeEventListener" in m) m.removeEventListener("change", onRM);
        else (m as any).removeListener(onRM);
      }

      this.invertObs?.disconnect();
      this.invertObs = null;
    };
  }

  stop(): void {
    this.cleanup?.();
    this.cleanup = null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getFrame(): PerceptionFrame {
    if (this.frame) return this.frame;
    // First snapshot before RAF ticks (safe default).
    return this.engine.step(performance.now(), this.nodes);
  }

  getReducedMotion(): boolean {
    return this.reducedMotion;
  }

  getDeltaZTarget(): boolean {
    return this.deltaZTarget;
  }

  setDeltaZTarget(next: boolean): void {
    this.deltaZTarget = next;
  }

  toggleDeltaZ(): void {
    this.deltaZTarget = !this.deltaZTarget;
  }

  setBaseProfile(next: BaseProfile): void {
    this.baseProfile = next;
  }

  setCanvas(canvas: HTMLCanvasElement | null): void {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
    this.resizeCanvas();
  }
}
