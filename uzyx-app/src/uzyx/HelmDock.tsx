import React, { useEffect, useMemo, useRef, useState } from "react";
import "./helmDock.css";
import { helmAPI } from "@/helm/helmState";

type Props = {
  size?: number; // px
  panelWidth?: number; // px
  panelHeight?: number; // px
};

type Point = { x: number; y: number };

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

const LS_KEY = "uzyx_helm_dock_v1";

function readStoredPos(): Point | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p.x !== "number" || typeof p.y !== "number") return null;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    return { x: p.x, y: p.y };
  } catch {
    return null;
  }
}

function setRootVar(key: string, value: string) {
  try {
    document.documentElement.style.setProperty(key, value);
  } catch {}
}

function clampPosToPanel(p: Point, opts: { size: number; panelWidth: number; panelHeight: number }): Point {
  const pad = 10;
  const vw = typeof window !== "undefined" ? window.innerWidth : opts.panelWidth;
  const vh = typeof window !== "undefined" ? window.innerHeight : opts.panelHeight;
  const w = Math.max(1, Math.min(opts.panelWidth, vw - pad * 2));
  const h = Math.max(1, Math.min(opts.panelHeight, vh - pad * 2));
  const minX = pad + w / 2 - opts.size / 2;
  const maxX = vw - pad - w / 2 - opts.size / 2;
  const minY = pad + h / 2 - opts.size / 2;
  const maxY = vh - pad - h / 2 - opts.size / 2;
  return {
    x: clamp(p.x, minX, maxX),
    y: clamp(p.y, minY, maxY),
  };
}

export function HelmDock({ size = 56, panelWidth = 560, panelHeight = 560 }: Props) {
  const [helmOpen, setHelmOpen] = useState(() => helmAPI.getState().open);
  useEffect(() => helmAPI.subscribe((s) => setHelmOpen(Boolean(s.open))), []);

  const [pos, setPos] = useState<Point>(() => {
    const stored = readStoredPos();
    return stored ?? { x: 24, y: 24 };
  });

  const dragRef = useRef<{
    active: boolean;
    moved: boolean;
    pointerId: number | null;
    start: { x: number; y: number };
    startPos: { x: number; y: number };
  }>({
    active: false,
    moved: false,
    pointerId: null,
    start: { x: 0, y: 0 },
    startPos: { x: 0, y: 0 },
  });

  const dims = useMemo(() => {
    const pad = 10;
    const vw = typeof window !== "undefined" ? window.innerWidth : panelWidth;
    const vh = typeof window !== "undefined" ? window.innerHeight : panelHeight;
    const w = Math.max(1, Math.min(panelWidth, vw - pad * 2));
    const h = Math.max(1, Math.min(panelHeight, vh - pad * 2));

    const cx = pos.x + size / 2;
    const cy = pos.y + size / 2;

    const left = cx - w / 2;
    const top = cy - h / 2;

    return { pad, w, h, cx, cy, left, top };
  }, [pos.x, pos.y, size, panelWidth, panelHeight]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(pos));
    } catch {}
  }, [pos.x, pos.y]);

  useEffect(() => {
    // Share anchor + panel rect with Helm overlay (CSS consumes these vars).
    setRootVar("--uzyx-helm-cx", `${dims.cx}px`);
    setRootVar("--uzyx-helm-cy", `${dims.cy}px`);
    setRootVar("--uzyx-helm-left", `${dims.left}px`);
    setRootVar("--uzyx-helm-top", `${dims.top}px`);
    setRootVar("--uzyx-helm-w", `${dims.w}px`);
    setRootVar("--uzyx-helm-h", `${dims.h}px`);
  }, [dims]);

  useEffect(() => {
    const onResize = () => {
      setPos((p) => clampPosToPanel(p, { size, panelWidth, panelHeight }));
    };
    onResize();
    window.addEventListener("resize", onResize, { passive: true });
    window.visualViewport?.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize as any);
    };
  }, [size, panelWidth, panelHeight]);

  const toggle = (force?: boolean) => {
    helmAPI.toggle(force);
  };

  return (
    <a
      className={`uzyxDock ${helmOpen ? "open" : ""}`}
      href="#"
      aria-label={helmOpen ? "helm close" : "helm open"}
      style={
        {
          left: pos.x,
          top: pos.y,
          width: size,
          height: size,
          ["--dock-size" as any]: `${size}px`,
        } as React.CSSProperties
      }
      onClick={(e) => {
        e.preventDefault();
        if (dragRef.current.moved) return;
        toggle();
      }}
      onKeyDown={(e) => {
        if (e.defaultPrevented) return;
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        toggle();
      }}
      onPointerDown={(e) => {
        if (e.defaultPrevented) return;
        if (e.button !== 0) return;
        dragRef.current.active = true;
        dragRef.current.moved = false;
        dragRef.current.pointerId = e.pointerId;
        dragRef.current.start = { x: e.clientX, y: e.clientY };
        dragRef.current.startPos = { x: pos.x, y: pos.y };
        try {
          (e.currentTarget as any).setPointerCapture?.(e.pointerId);
        } catch {}
      }}
      onPointerMove={(e) => {
        const d = dragRef.current;
        if (!d.active) return;
        if (d.pointerId !== e.pointerId) return;

        const dx = e.clientX - d.start.x;
        const dy = e.clientY - d.start.y;
        if (Math.hypot(dx, dy) > 6) d.moved = true;

        setPos(
          clampPosToPanel(
            { x: d.startPos.x + dx, y: d.startPos.y + dy },
            { size, panelWidth, panelHeight }
          )
        );
      }}
      onPointerUp={(e) => {
        const d = dragRef.current;
        if (d.pointerId === e.pointerId) d.pointerId = null;
        d.active = false;
        // Keep moved flag for the synthetic click; reset shortly after.
        if (d.moved) window.setTimeout(() => (dragRef.current.moved = false), 60);
      }}
      onPointerCancel={() => {
        dragRef.current.active = false;
        dragRef.current.pointerId = null;
        dragRef.current.moved = false;
      }}
    >
      <span className="uzyxDockText" aria-hidden="true">
        .O.
      </span>
    </a>
  );
}
