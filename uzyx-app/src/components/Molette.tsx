import React, { useEffect, useMemo, useRef, useState } from "react";
import "./molette.css";
import type { NodeId } from "@/graph/graph";
import { angleToIndex, getAdjacent, normalizeAngle } from "@/molette/moletteLogic";
import { usePerceptionStore } from "@/perception/PerceptionProvider";
import { helmAPI } from "@/helm/helmState";
import { useUzyxState } from "@/uzyx/useUzyxState";
import { contactsStore } from "@/contacts/contactsStore";
import { getLastFerryCode } from "@/ferry/ferrySession";
import { getPresences } from "@/stream/streamEngine";
import { setInvert } from "@/theme/invert";

function hrefFor(id: string) {
  return `#/${id}`;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function fnv1a32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function angleDiff(a: number, b: number) {
  return normalizeAngle(a - b);
}

function isInteractiveTarget(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return false;
  return Boolean(t.closest("a,button,input,textarea,select,[role='link'],[contenteditable='true']"));
}

function phiAngleFromFrame(frame: { focus: { fx: number; fy: number; weight: number }; pointer: { x: number; y: number } }) {
  const c = { x: 0.5, y: 0.5 };
  const fx = frame.focus.fx - c.x;
  const fy = frame.focus.fy - c.y;
  const pm = Math.hypot(frame.pointer.x - c.x, frame.pointer.y - c.y);
  if (frame.focus.weight > 0.22 && Math.hypot(fx, fy) > 1e-3) return Math.atan2(fy, fx);
  if (pm > 0.06) return Math.atan2(frame.pointer.y - c.y, frame.pointer.x - c.x);
  return -Math.PI / 2;
}

function useHelmState() {
  const [s, setS] = useState(() => helmAPI.getState());
  useEffect(() => helmAPI.subscribe(setS), []);
  return s;
}

function minAngleDist(a: number, b: number) {
  const tau = Math.PI * 2;
  let d = (a - b) % tau;
  if (d < -Math.PI) d += tau;
  if (d > Math.PI) d -= tau;
  return Math.abs(d);
}

function ghostFor(id: string | null) {
  if (!id) return "—";
  if (id === "LAND") return "1nv3rs10n";
  if (id === "FERRY") return "+prs3nc3";
  if (id === "CONTACT") return "r3p3rt01r3";
  if (id === "STR3M") return "p01nts + d3grés";
  if (id === "HAUT") return "haut";
  return "—";
}

type PanelPx = { left: number; top: number; w: number; h: number; cx: number; cy: number };

function computeFullscreenPanelPx(opts?: { pad?: number; min?: number }): PanelPx {
  const pad = opts?.pad ?? 14;
  const minSize = opts?.min ?? 240;
  if (typeof window === "undefined") {
    const w = 560;
    const h = 560;
    return { left: 0, top: 0, w, h, cx: w / 2, cy: h / 2 };
  }
  const vv = window.visualViewport;
  const vw = Math.max(1, Math.round(vv?.width ?? window.innerWidth));
  const vh = Math.max(1, Math.round(vv?.height ?? window.innerHeight));
  const ox = Math.round(vv?.offsetLeft ?? 0);
  const oy = Math.round(vv?.offsetTop ?? 0);
  const size = Math.max(minSize, Math.min(vw - pad * 2, vh - pad * 2));
  const left = ox + (vw - size) / 2;
  const top = oy + (vh - size) / 2;
  return { left, top, w: size, h: size, cx: left + size / 2, cy: top + size / 2 };
}

export function Molette(props: { current: NodeId }) {
  const store = usePerceptionStore();
  const current = props.current;

  const adjacent = useMemo(() => getAdjacent(current) as NodeId[], [current]);

  const uzyx = useUzyxState();
  const helm = useHelmState();

  const open = helm.open;
  const [panel, setPanel] = useState<PanelPx>(() => computeFullscreenPanelPx());
  const [theta, setTheta] = useState(0);
  const thetaRef = useRef(0);
  useEffect(() => {
    thetaRef.current = theta;
  }, [theta]);
  const [phase, setPhase] = useState<"idle" | "deploy" | "traverse">("idle");
  const [flash, setFlash] = useState(false);
  const flashTimerRef = useRef<number | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const islandRef = useRef<HTMLCanvasElement | null>(null);

  const triggerFlash = () => {
    if (store.getReducedMotion()) return;
    setFlash(true);
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlash(false), 180);
  };
  const sel = useMemo(() => {
    if (adjacent.length === 0) return null;
    const idx = angleToIndex(theta + Math.PI / 2, adjacent.length);
    return { idx, id: adjacent[idx] };
  }, [adjacent, theta]);

  const dragRef = useRef<{ active: boolean; startA: number; startTheta: number; pointerId: number | null; x: number; y: number }>({
    active: false,
    startA: 0,
    startTheta: 0,
    pointerId: null,
    x: 0,
    y: 0,
  });

  const centerRef = useRef<HTMLDivElement | null>(null);
  const commitRef = useRef<{ busy: boolean }>({ busy: false });

  const oScore = useMemo(() => {
    if (uzyx.failSafe) return 0.02;
    if (!uzyx.towardO) return uzyx.unstable ? 0.36 : 0.48; // M
    if (uzyx.unstable) return 0.74; // P
    return 0.92; // O
  }, [uzyx.failSafe, uzyx.towardO, uzyx.unstable]);

  const score = clamp01(oScore);

  useEffect(() => {
    if (!open) return;
    if (helm.mode !== "normal") return;
    if (helm.previewLevel < 2) return;
    const id = sel?.id;
    if (!id) return;

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      if (id === "CONTACT") {
        try {
          contactsStore.list();
        } catch {}
      }
      if (id === "FERRY") {
        try {
          getLastFerryCode();
        } catch {}
      }
      if (id === "STR3M") {
        try {
          getPresences(12);
        } catch {}
      }
    };

    const w = window as any;
    const handle =
      typeof w.requestIdleCallback === "function"
        ? w.requestIdleCallback(run, { timeout: 680 })
        : window.setTimeout(run, 140);

    return () => {
      cancelled = true;
      if (typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [open, helm.mode, helm.previewLevel, sel?.id]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 1) return;
      const s = helmAPI.getState();
      if (!s.open && isInteractiveTarget(e.target)) return;
      e.preventDefault();
      helmAPI.toggle();
    };
    window.addEventListener("mousedown", onMouseDown, { capture: true });
    return () => window.removeEventListener("mousedown", onMouseDown, true);
  }, []);

  useEffect(() => {
    const inCenter = (x: number, y: number) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const dx = x - cx;
      const dy = y - cy;
      // Slightly forgiving hit radius: center is intentionally empty.
      const r = Math.max(84, Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.12));
      return dx * dx + dy * dy <= r * r;
    };

    const onClick = (e: MouseEvent) => {
      const s = helmAPI.getState();
      if (s.open) return;
      if (e.button !== 0) return;
      if (!inCenter(e.clientX, e.clientY)) return;

      if (isInteractiveTarget(e.target)) {
        const hp = e.target instanceof Element ? e.target.closest(".hautPoint") : null;
        if (!hp) return;
        if (hp.getAttribute("data-revealed") === "1") return;
      }

      e.preventDefault();
      e.stopPropagation();
      setInvert(true);
      helmAPI.toggle(true);
    };

    window.addEventListener("click", onClick, { capture: true });
    return () => window.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const k = String(e.key || "").toLowerCase();
      if (e.altKey && k === "h") {
        if (!open && isInteractiveTarget(e.target)) return;
        e.preventDefault();
        helmAPI.toggle();
        return;
      }
      if (!open) return;
      if (k === "escape") {
        e.preventDefault();
        helmAPI.toggle(false);
        return;
      }
      if (k === "arrowleft") {
        e.preventDefault();
        setTheta((t) => normalizeAngle(t - (Math.PI * 2) / Math.max(1, adjacent.length)));
      }
      if (k === "arrowright") {
        e.preventDefault();
        setTheta((t) => normalizeAngle(t + (Math.PI * 2) / Math.max(1, adjacent.length)));
      }
      const n = Number.parseInt(k, 10);
      if (Number.isFinite(n) && n >= 1 && n <= adjacent.length) {
        e.preventDefault();
        const idx = n - 1;
        const target = normalizeAngle((idx / Math.max(1, adjacent.length)) * Math.PI * 2 - Math.PI / 2);
        setTheta(target);
      }
      if (k === "enter") {
        e.preventDefault();
        triggerFlash();
        commitRef.current.busy = true;
        setPhase("traverse");
        const jump = () => {
          const id = helmAPI.commit() ?? sel?.id;
          if (id) window.location.hash = hrefFor(id);
          helmAPI.toggle(false);
          setPhase("idle");
          commitRef.current.busy = false;
        };
        if (store.getReducedMotion()) jump();
        else window.setTimeout(jump, 220);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, adjacent.length, store, sel?.id]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    // Seed theta from Φ when opening (molette anchors on focus without reticle).
    const frame = store.getFrame();
    setPanel(computeFullscreenPanelPx());
    setTheta(phiAngleFromFrame(frame));
    setPhase("deploy");
    const t = window.setTimeout(() => setPhase("idle"), store.getReducedMotion() ? 0 : 460);
    window.setTimeout(() => {
      try {
        centerRef.current?.focus?.({ preventScroll: true } as any);
      } catch {}
    }, store.getReducedMotion() ? 0 : 90);
    return () => window.clearTimeout(t);
  }, [open, store]);

  useEffect(() => {
    if (!open) return;
    const apply = () => setPanel(computeFullscreenPanelPx());
    apply();
    window.addEventListener("resize", apply, { passive: true });
    window.visualViewport?.addEventListener("resize", apply, { passive: true } as any);
    return () => {
      window.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("resize", apply as any);
    };
  }, [open]);

  // Subtle "alive" drift for the ring/halo (keeps selection stable; only surface moves).
  useEffect(() => {
    if (!open) return;
    const el = overlayRef.current;
    if (!el) return;

    const reduced = store.getReducedMotion();
    let raf: number | null = null;
    let interval: number | null = null;

    const step = (now: number) => {
      const t = now / 1000;
      const f = store.getFrame();
      const blend = f.stateBlend;
      const speedK = clamp01(f.pointer.speed / 900);
      const k = (0.25 + 0.75 * blend) * (reduced ? 0.18 : 1);

      const wobble =
        (Math.sin(t * 0.7) * 1.6 + Math.sin(t * 0.23 + 1.7) * 0.8 + Math.sin(t * 1.9 + 0.2) * 0.35 * speedK) * k;

      el.style.setProperty("--ring-wobble", `${wobble.toFixed(2)}deg`);
      el.style.setProperty("--halo-breathe", String((0.88 + 0.12 * Math.sin(t * 0.38 + 0.9)).toFixed(3)));
    };

    if (reduced) {
      step(performance.now());
      interval = window.setInterval(() => step(performance.now()), 900);
      return () => {
        if (interval !== null) window.clearInterval(interval);
        el.style.removeProperty("--ring-wobble");
        el.style.removeProperty("--halo-breathe");
      };
    }

    const loop = (now: number) => {
      step(now);
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);

    return () => {
      if (raf !== null) window.cancelAnimationFrame(raf);
      el.style.removeProperty("--ring-wobble");
      el.style.removeProperty("--halo-breathe");
    };
  }, [open, store]);

  // "Island" matter (no images): a dynamic coastline around the ring, drawn in Canvas.
  useEffect(() => {
    if (!open) return;
    const canvas = islandRef.current;
    const wheelEl = wheelRef.current;
    if (!canvas || !wheelEl) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = store.getReducedMotion();
    const seed = fnv1a32(`${current}:${adjacent.join(",")}`);
    const tau = Math.PI * 2;

    let w = 0;
    let h = 0;
    let dpr = 1;

    const resize = () => {
      const r = wheelEl.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };

    resize();
    const ro = "ResizeObserver" in window ? new ResizeObserver(() => resize()) : null;
    ro?.observe(wheelEl);

    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      const fg = cs.getPropertyValue("--fg").trim() || "#e7e7e7";
      const halo = cs.getPropertyValue("--halo").trim() || "rgba(255,180,90,.25)";
      return { fg, halo };
    };

    let colors = readColors();
    const obs = new MutationObserver(() => {
      colors = readColors();
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-invert"] });

    const phase0 = ((seed % 997) / 997) * tau;
    const phase1 = (((seed >>> 11) % 991) / 991) * tau;
    const phase2 = (((seed >>> 19) % 983) / 983) * tau;
    const f1 = 3 + (seed % 3); // 3..5
    const f2 = 7 + ((seed >>> 3) % 5); // 7..11
    const f3 = 4 + ((seed >>> 7) % 4); // 4..7

    const draw = (nowMs: number) => {
      const t = nowMs / 1000;
      const frame = store.getFrame();
      const phi = phiAngleFromFrame(frame);
      const th = thetaRef.current;

      const mis = Math.min(1, Math.abs(angleDiff(th, phi)) / Math.PI);
      const calm = clamp01((1 - mis) * (0.35 + 0.65 * frame.focus.weight));
      const wild = 1 - calm;

      const min = Math.max(1, Math.min(w, h));
      const cx = w / 2;
      const cy = h / 2;
      const baseR = min * 0.315;
      const amp = min * (0.012 + 0.032 * wild + 0.03 * frame.stateBlend) * (reduced ? 0.52 : 1);
      const bulgeAmp = min * (0.01 + 0.05 * (0.25 + 0.75 * frame.stateBlend));
      const bulgeSigma = 0.62;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const segments = reduced ? 72 : 112;
      ctx.beginPath();
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * tau;
        const n =
          Math.sin(a * f1 + t * 0.55 + phase0) * 0.62 +
          Math.sin(a * f2 - t * 0.35 + phase1) * 0.28 +
          Math.cos((a - th) * f3 + t * 0.22 + phase2) * 0.24;

        const d = angleDiff(a, th);
        const bulge = Math.exp(-(d * d) / (bulgeSigma * bulgeSigma)) * bulgeAmp;

        const r = baseR + n * amp + bulge;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      // Coastline (bicolore): fg + a small halo at ΔZ′ peaks.
      ctx.globalAlpha = 0.22 + 0.22 * (0.55 + 0.45 * wild);
      ctx.strokeStyle = colors.fg;
      ctx.lineWidth = 1;
      ctx.stroke();

      if (!reduced) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        // Always present (subtle), stronger in ΔZ′ / instability.
        const baseGlow = 0.06 + 0.08 * (0.25 + 0.75 * wild);
        const dzGlow = 0.06 * frame.stateBlend;
        ctx.globalAlpha = clamp01(baseGlow + dzGlow);
        ctx.strokeStyle = colors.halo;
        ctx.filter = `blur(${Math.min(5, 0.9 + frame.stateBlend * 2.6)}px)`;
        ctx.stroke();
        ctx.restore();
      }

      // Shoals / soundings: points & slashes (no icons).
      const soundings = reduced ? 78 : 138;
      ctx.globalAlpha = 0.06 + 0.14 * wild;
      ctx.fillStyle = colors.fg;
      ctx.strokeStyle = colors.fg;
      for (let i = 0; i < soundings; i++) {
        const a = (((i * 97) ^ seed) % 2048) / 2048 * tau + (i % 3) * 0.003;
        const tide = Math.sin(t * 0.45 + a * 3.2 + phase1);
        const rr = baseR + amp * 0.35 + (0.12 + 0.2 * wild) * min + tide * (0.008 + 0.012 * wild) * min;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;

        if (i % 5 === 0) {
          const len = 6 + (i % 7);
          ctx.beginPath();
          ctx.moveTo(x - len * 0.45, y + len * 0.45);
          ctx.lineTo(x + len * 0.45, y - len * 0.45);
          ctx.stroke();
        } else {
          ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
        }
      }

      ctx.globalAlpha = 1;
    };

    let raf: number | null = null;
    let interval: number | null = null;
    const tick = (now: number) => {
      draw(now);
      if (!reduced) raf = window.requestAnimationFrame(tick);
    };

    tick(performance.now());
    if (reduced) interval = window.setInterval(() => draw(performance.now()), 980);

    return () => {
      if (raf !== null) window.cancelAnimationFrame(raf);
      if (interval !== null) window.clearInterval(interval);
      ro?.disconnect();
      obs.disconnect();
    };
  }, [open, store, current, adjacent]);

  useEffect(() => {
    helmAPI.setActive(current);
  }, [current]);

  useEffect(() => {
    const mode = uzyx.failSafe ? "failsafe-hard" : "normal";
    helmAPI.setMode(mode);
    if (uzyx.failSafe && open) helmAPI.setPreviewLevel(0);
  }, [uzyx.failSafe, open]);

  useEffect(() => {
    if (!open) return;
    if (sel?.id) helmAPI.select(sel.id);
  }, [open, sel?.id]);

  useEffect(() => {
    if (!open) return;
    const desired = helm.selectedPageId;
    if (!desired) return;
    const idx = adjacent.indexOf(desired as NodeId);
    if (idx < 0) return;
    const n = Math.max(1, adjacent.length);
    if (sel?.idx === idx) return;
    const target = normalizeAngle((idx / n) * Math.PI * 2 - Math.PI / 2);
    setTheta(target);
  }, [open, helm.selectedPageId, adjacent, sel?.idx]);

  // Gesture (optional): two-finger hold opens the molette (mobile-friendly, low false positives).
  useEffect(() => {
    if (open) return;
    let t: number | null = null;
    let sx = 0;
    let sy = 0;

    const clear = () => {
      if (t !== null) window.clearTimeout(t);
      t = null;
    };

    const avg = (touches: TouchList) => {
      const a = touches[0];
      const b = touches[1];
      return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
    };

    const onStart = (e: TouchEvent) => {
      if (open) return;
      if (e.touches.length !== 2) return;
      if (isInteractiveTarget(e.target)) return;
      const p = avg(e.touches);
      sx = p.x;
      sy = p.y;
      clear();
      t = window.setTimeout(() => {
        t = null;
        helmAPI.toggle(true);
      }, 260);
    };

    const onMove = (e: TouchEvent) => {
      if (t === null) return;
      if (e.touches.length !== 2) return clear();
      const p = avg(e.touches);
      if (Math.hypot(p.x - sx, p.y - sy) > 14) clear();
    };

    const onEnd = () => clear();

    window.addEventListener("touchstart", onStart, { capture: true, passive: true });
    window.addEventListener("touchmove", onMove, { capture: true, passive: true });
    window.addEventListener("touchend", onEnd, { capture: true, passive: true });
    window.addEventListener("touchcancel", onEnd, { capture: true, passive: true });
    return () => {
      clear();
      window.removeEventListener("touchstart", onStart, true);
      window.removeEventListener("touchmove", onMove, true);
      window.removeEventListener("touchend", onEnd, true);
      window.removeEventListener("touchcancel", onEnd, true);
    };
  }, [open]);

  if (!open) return null;

  const frame = store.getFrame();
  const blend = frame.stateBlend;

  // Wheel is intentionally disabled to keep helm navigation explicit.
  const onWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const angleOf = (clientX: number, clientY: number) => {
    const el = wheelRef.current;
    const fx = window.innerWidth / 2;
    const fy = window.innerHeight / 2;
    if (!el) return Math.atan2(clientY - fy, clientX - fx);
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    return Math.atan2(clientY - cy, clientX - cx);
  };

  const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (isInteractiveTarget(e.target)) return;
    dragRef.current.active = true;
    dragRef.current.pointerId = e.pointerId;
    dragRef.current.startA = angleOf(e.clientX, e.clientY);
    dragRef.current.startTheta = theta;
    dragRef.current.x = e.clientX;
    dragRef.current.y = e.clientY;
    try {
      (e.currentTarget as any).setPointerCapture?.(e.pointerId);
    } catch {}
  };

  const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (!dragRef.current.active) return;
    if (dragRef.current.pointerId !== e.pointerId) return;
    const a = angleOf(e.clientX, e.clientY);
    const d = normalizeAngle(a - dragRef.current.startA);
    setTheta(normalizeAngle(dragRef.current.startTheta + d));
  };

  const onPointerUp: React.PointerEventHandler<HTMLDivElement> = () => {
    dragRef.current.active = false;
    dragRef.current.pointerId = null;
  };

  const onCommit = () => {
    if (commitRef.current.busy) return;
    const id = sel?.id;
    if (!id) return;
    triggerFlash();
    commitRef.current.busy = true;
    setPhase("traverse");
    const jump = () => {
      helmAPI.commit();
      window.location.hash = hrefFor(id);
      helmAPI.toggle(false);
      setPhase("idle");
      commitRef.current.busy = false;
    };
    if (store.getReducedMotion()) jump();
    else window.setTimeout(jump, 220);
  };

  const hint = ghostFor(sel?.id ?? null);
  const keyRangeHint = adjacent.length > 1 ? `1..${adjacent.length}` : "1";
  const thetaDeg = Math.round(((theta + Math.PI * 2) % (Math.PI * 2)) * (180 / Math.PI));

  const birds = useMemo(() => {
    const n = Math.max(12, Math.min(48, 14 + adjacent.length * 7));
    const list: Array<{ a: number; r: number; g: string; k: number }> = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (i % 3) * 0.06;
      const r = 0.72 + (i % 9) * 0.012;
      const g = i % 4 === 0 ? "/" : i % 3 === 0 ? "\\" : i % 2 === 0 ? "." : "·";
      list.push({ a, r, g, k: 0 });
    }
    return list;
  }, [adjacent.length]);

  const birdsStyled = useMemo(() => {
    const base = theta;
    const hard = helm.mode === "failsafe-hard";
    return birds.map((b) => {
      const d = minAngleDist(b.a, base);
      const k = Math.max(0, 1 - d / 0.32);
      const opacity = hard ? 0.02 + k * 0.04 : 0.06 + k * 0.18;
      return { ...b, k, opacity };
    });
  }, [birds, theta, helm.mode]);

  return (
    <div
      ref={overlayRef}
      className={`helmOverlay ${phase === "deploy" ? "is-deploy" : ""} ${phase === "traverse" ? "is-traversing" : ""} ${flash ? "is-flash" : ""}`}
      role="dialog"
      aria-label="helm"
      data-mode={helm.mode}
      style={
        {
          ["--uzyx-helm-cx" as any]: `${Math.round(panel.cx)}px`,
          ["--uzyx-helm-cy" as any]: `${Math.round(panel.cy)}px`,
          ["--uzyx-helm-left" as any]: `${Math.round(panel.left)}px`,
          ["--uzyx-helm-top" as any]: `${Math.round(panel.top)}px`,
          ["--uzyx-helm-w" as any]: `${Math.round(panel.w)}px`,
          ["--uzyx-helm-h" as any]: `${Math.round(panel.h)}px`,
          ["--theta" as any]: `${theta.toFixed(4)}rad`,
          ["--ring-rot" as any]: `${thetaDeg}deg`,
          ["--dz-soft-blur" as any]: `${(blend * 0.35).toFixed(2)}px`,
          ["--dz-blur" as any]: `${(blend * 0.9).toFixed(2)}px`,
          ["--birds-dur" as any]: `${uzyx.towardO ? 44 : 32}s`,
        } as React.CSSProperties
      }
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="helmHalo" aria-hidden="true" />
      <div ref={wheelRef} className="helmWheel" aria-hidden="true">
        <canvas ref={islandRef} className="helmIsland" aria-hidden="true" />
        <div className="helmRing" />
        <div className="helmPoint" aria-hidden="true" />
        <div className="helmBirdField" aria-hidden="true">
          {birdsStyled.map((b, i) => (
            <span
              key={i}
              className="helmBird"
              style={
                {
                  ["--ba" as any]: `${b.a.toFixed(4)}rad`,
                  ["--br" as any]: String(b.r.toFixed(3)),
                  ["--bo" as any]: String(b.opacity.toFixed(3)),
                } as React.CSSProperties
              }
            >
              {b.g}
            </span>
          ))}
        </div>
        {adjacent.map((id, i) => {
          const a = (i / Math.max(1, adjacent.length)) * 360 - 90;
          const isSelected = sel?.id === id;
          const m = frame.nodes[id];
          return (
            <div
              key={id}
              className={`helmSlot ${isSelected ? "is-selected" : ""}`}
              style={
                {
                  ["--a" as any]: `${a.toFixed(3)}deg`,
                  ["--scale-x" as any]: m ? String(m.typo.scaleX.toFixed(3)) : "1",
                  ["--scale-y" as any]: m ? String(m.typo.scaleY.toFixed(3)) : "1",
                  ["--skew" as any]: m ? `${m.typo.skewDeg.toFixed(2)}deg` : "0deg",
                  ["--blur-orient" as any]: m ? `${m.blur.orient.toFixed(2)}px` : "0px",
                  ["--blur-depth" as any]: m ? `${m.blur.depth.toFixed(2)}px` : "0px",
                  ["--blur-threshold" as any]: m ? `${m.blur.threshold.toFixed(2)}px` : "0px",
                  ["--blur-ox" as any]: m ? `${m.blur.ox.toFixed(2)}px` : "0px",
                  ["--blur-oy" as any]: m ? `${m.blur.oy.toFixed(2)}px` : "0px",
                } as React.CSSProperties
              }
              data-node={id}
            >
              <span className="helmLabel">{id}</span>
            </div>
          );
        })}
      </div>

      <div
        ref={centerRef}
        className="helmCenter"
        role="link"
        tabIndex={0}
        aria-label="commit"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onCommit();
        }}
        onKeyDown={(e) => {
          if (e.defaultPrevented) return;
          if (e.key !== "Enter") return;
          e.preventDefault();
          onCommit();
        }}
      >
        <svg
          className="oPointIcon"
          viewBox="0 0 410 80"
          aria-hidden="true"
          focusable="false"
          style={
            {
              ["--score" as any]: String(score),
            } as React.CSSProperties
          }
        >
          <text className="oPointText" x="205" y="40" textAnchor="middle" dominantBaseline="middle">
            . O.
          </text>
          <g transform="translate(205 40)">
            <g id="orbit" className="oPointOrbit">
              <circle className="oPointPivot" cx="0" cy="0" r="0.01" opacity="0" />
              <circle id="aliveDot" className="oPointAlive" cx="60" cy="4" r="4" />
            </g>
          </g>
        </svg>
        <span className="helmCenterId" aria-hidden="true">
          {helm.activePageId ?? current}
        </span>
      </div>

      {helm.previewLevel > 0 && helm.mode !== "failsafe-hard" ? (
        <div className="helmGhost" aria-hidden="true">
          <span className="helmGhostLine">{`//// ${sel?.id ?? "—"} · ${hint} · ${thetaDeg}°`}</span>
          <span className="helmGhostHint">{`drag · ←/→ · ${keyRangeHint} · ↵`}</span>
        </div>
      ) : null}
    </div>
  );
}
