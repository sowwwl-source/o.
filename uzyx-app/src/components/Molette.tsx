import React, { useEffect, useMemo, useRef, useState } from "react";
import "./molette.css";
import type { NodeId } from "@/graph/graph";
import { angleToIndex, getAdjacent, normalizeAngle } from "@/molette/moletteLogic";
import { usePerceptionStore } from "@/perception/PerceptionProvider";

function hrefFor(id: string) {
  return `#/${id}`;
}

function isInteractiveTarget(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return false;
  return Boolean(t.closest("a,button,input,textarea,select"));
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

export function Molette(props: { current: NodeId }) {
  const store = usePerceptionStore();
  const current = props.current;

  const adjacent = useMemo(() => getAdjacent(current) as NodeId[], [current]);

  const [open, setOpen] = useState(false);
  const [theta, setTheta] = useState(0);
  const [phase, setPhase] = useState<"idle" | "arming" | "traverse">("idle");
  const sel = useMemo(() => {
    if (adjacent.length === 0) return null;
    const idx = angleToIndex(theta, adjacent.length);
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

  const holdRef = useRef<{ t: number | null; fired: boolean }>({ t: null, fired: false });

  const stopHold = (opts?: { resetFired?: boolean }) => {
    if (holdRef.current.t !== null) window.clearTimeout(holdRef.current.t);
    holdRef.current.t = null;
    if (opts?.resetFired) holdRef.current.fired = false;
    setPhase("idle");
  };

  const startHold = () => {
    if (!sel?.id) return;
    if (holdRef.current.t !== null) window.clearTimeout(holdRef.current.t);
    holdRef.current.fired = false;
    setPhase("arming");
    const ms = store.getReducedMotion() ? 0 : 520;
    holdRef.current.t = window.setTimeout(() => {
      holdRef.current.t = null;
      holdRef.current.fired = true;
      setPhase("traverse");
      const jump = () => {
        window.location.hash = hrefFor(sel.id);
        setOpen(false);
        stopHold({ resetFired: true });
      };
      if (store.getReducedMotion()) jump();
      else window.setTimeout(jump, 170);
    }, ms);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const k = String(e.key || "").toLowerCase();
      if (k === "m") {
        if (isInteractiveTarget(e.target)) return;
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (!open) return;
      if (k === "escape") {
        e.preventDefault();
        setOpen(false);
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
      if (k === "enter" || k === " ") {
        e.preventDefault();
        startHold();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, adjacent.length, sel?.id]);

  useEffect(() => {
    if (!open) return;
    // Seed theta from Φ when opening (molette anchors on focus without reticle).
    const frame = store.getFrame();
    setTheta(phiAngleFromFrame(frame));
    setPhase("idle");
    holdRef.current.fired = false;
  }, [open, store]);

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
        setOpen(true);
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
    stopHold({ resetFired: true });
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
    startHold();
  };

  const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (!dragRef.current.active) return;
    if (dragRef.current.pointerId !== e.pointerId) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    if (Math.hypot(dx, dy) > 10) stopHold({ resetFired: true });
    const a = angleOf(e.clientX, e.clientY);
    const d = normalizeAngle(a - dragRef.current.startA);
    setTheta(normalizeAngle(dragRef.current.startTheta + d));
  };

  const onPointerUp: React.PointerEventHandler<HTMLDivElement> = () => {
    dragRef.current.active = false;
    dragRef.current.pointerId = null;
    stopHold({ resetFired: true });
  };

  const onClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (holdRef.current.fired) {
      e.preventDefault();
      e.stopPropagation();
      holdRef.current.fired = false;
    }
  };

  return (
    <div
      className={`moletteOverlay ${phase === "arming" ? "is-arming" : ""} ${phase === "traverse" ? "is-traversing" : ""}`}
      role="dialog"
      aria-label="molette"
      style={
        {
          ["--theta" as any]: `${theta.toFixed(4)}rad`,
          ["--dz-soft-blur" as any]: `${(blend * 0.35).toFixed(2)}px`,
          ["--dz-blur" as any]: `${(blend * 0.9).toFixed(2)}px`,
        } as React.CSSProperties
      }
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={onClick}
    >
      <div className="moletteWheel" aria-hidden="true">
        <div className="moletteRing" />
        {adjacent.map((id, i) => {
          const a = (i / Math.max(1, adjacent.length)) * 360;
          const isSelected = sel?.id === id;
          const m = frame.nodes[id];
          return (
            <div
              key={id}
              className={`moletteSlot ${isSelected ? "is-selected" : ""}`}
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
              <span className="moletteDot" aria-hidden="true" />
              <span className="moletteLabel">{id}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
