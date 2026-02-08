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

function hrefFor(id: string) {
  return `#/${id}`;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
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

export function Molette(props: { current: NodeId }) {
  const store = usePerceptionStore();
  const current = props.current;

  const adjacent = useMemo(() => getAdjacent(current) as NodeId[], [current]);

  const uzyx = useUzyxState();
  const helm = useHelmState();

  const open = helm.open;
  const [theta, setTheta] = useState(0);
  const [phase, setPhase] = useState<"idle" | "deploy" | "traverse">("idle");
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
  const lastDragRef = useRef<number>(0);

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
      if (k === "enter") {
        e.preventDefault();
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
    if (!open) return;
    // Seed theta from Φ when opening (molette anchors on focus without reticle).
    const frame = store.getFrame();
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

  const onWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const d = clamp((e.deltaX || 0) + (e.deltaY || 0), -120, 120);
    const k = store.getReducedMotion() ? 0.002 : 0.006;
    setTheta((t) => normalizeAngle(t + d * k));
  };

  const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  const angleOf = (clientX: number, clientY: number) => Math.atan2(clientY - center.y, clientX - center.x);

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
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    if (Math.hypot(dx, dy) > 10) lastDragRef.current = Date.now();
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
      className={`helmOverlay ${phase === "deploy" ? "is-deploy" : ""} ${phase === "traverse" ? "is-traversing" : ""}`}
      role="dialog"
      aria-label="helm"
      data-mode={helm.mode}
      style={
        {
          ["--theta" as any]: `${theta.toFixed(4)}rad`,
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
      onClick={(e) => {
        if (e.defaultPrevented) return;
        if (commitRef.current.busy) return;
        const now = Date.now();
        if (now - lastDragRef.current < 240) return;
        onCommit();
      }}
    >
      <div className="helmWheel" aria-hidden="true">
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
          <text className="oPointText" x="160" y="40" textAnchor="middle" dominantBaseline="middle">
            .
          </text>
          <text className="oPointText" x="205" y="40" textAnchor="middle" dominantBaseline="middle">
            O
          </text>
          <text className="oPointText" x="250" y="40" textAnchor="middle" dominantBaseline="middle">
            .
          </text>
          <g id="orbit" className="oPointOrbit">
            <circle className="oPointPivot" cx="205" cy="40" r="0.01" opacity="0" />
            <circle id="aliveDot" className="oPointAlive" cx="265" cy="44" r="4" />
          </g>
        </svg>
        <span className="helmCenterId" aria-hidden="true">
          {helm.activePageId ?? current}
        </span>
      </div>

      {helm.previewLevel > 0 && helm.mode !== "failsafe-hard" ? (
        <div className="helmGhost" aria-hidden="true">
          <span className="helmGhostLine">{`//// ${sel?.id ?? "—"} · ${hint} · ${thetaDeg}°`}</span>
        </div>
      ) : null}
    </div>
  );
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
