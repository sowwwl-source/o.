import React, { useEffect, useMemo, useRef } from "react";
import "../stream/stream.css";
import { getPresences, initPoints, stepPoints, type StreamParams, type StreamPoint } from "../stream/streamEngine";
import { HautPoint } from "@/components/HautPoint";
import { usePerceptionStore } from "@/perception/PerceptionProvider";

const DEFAULT_PARAMS: StreamParams = {
  density: 1400,
  speed: 0.6,
  amplitude: 16,
  revealRate: 0.35,
};

function cssVars() {
  const cs = getComputedStyle(document.documentElement);
  const fg = cs.getPropertyValue("--fg").trim() || "#e7e7e7";
  const bg = cs.getPropertyValue("--bg").trim() || "#0b0d0f";
  return { fg, bg };
}

export function StreamPage() {
  const store = usePerceptionStore();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const pointsRef = useRef<StreamPoint[]>([]);
  const params = useMemo(() => DEFAULT_PARAMS, []);
  const presences = useMemo(() => getPresences(22), []);

  useEffect(() => {
    store.setBaseProfile("stream");
  }, [store]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let colors = cssVars();
    const obs = new MutationObserver(() => (colors = cssVars()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-invert"] });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const perf = w * h > 1_200_000 ? 0.72 : 1;
      const rm = store.getReducedMotion();
      const density = Math.max(640, Math.floor(params.density * perf * (rm ? 0.6 : 1)));
      pointsRef.current = initPoints(density, presences);
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });

    let lastVibeMs = 0;

    const loop = (now: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const t = now / 1000;

      const rm = store.getReducedMotion();
      const speedK = rm ? 0.28 : 1;

      ctx.fillStyle = colors.bg;
      ctx.globalAlpha = 1;
      ctx.fillRect(0, 0, w, h);

      stepPoints(pointsRef.current, t * speedK, params);

      // points
      ctx.fillStyle = colors.fg;
      ctx.globalAlpha = 0.76;
      for (const p of pointsRef.current) {
        const x = p.x * w;
        const y = p.y * h;
        ctx.fillRect(x, y, 1.2, 1.2);
      }

      // degrees + presences (micro text, no avatars)
      ctx.font = "11px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
      ctx.globalAlpha = 0.34;
      const stride = rm ? 260 : 190;

      for (let i = 0; i < pointsRef.current.length; i++) {
        const p = pointsRef.current[i];
        const x = p.x * w;
        const y = p.y * h;
        if (i % stride === 0) ctx.fillText(`${p.deg}°`, x + 4, y - 2);

        if (!p.presence) continue;
        const pulse = 0.5 + 0.5 * Math.sin(t * (p.presence.hz * Math.PI * 2) + p.phase);
        const threshold = 0.92 + (1 - params.revealRate) * 0.06;
        if (pulse < threshold) continue;

        const alpha = rm ? 0.18 : 0.22 + pulse * 0.28;
        ctx.globalAlpha = alpha;
        ctx.fillText(p.presence.name, x + 4, y - 2);
        ctx.fillRect(x - 1, y - 1, 2.2, 2.2);

        if (!rm && typeof navigator !== "undefined" && "vibrate" in navigator) {
          const nowMs = now;
          if (nowMs - lastVibeMs > 2400) {
            lastVibeMs = nowMs;
            try {
              (navigator as any).vibrate?.(8);
            } catch {}
          }
        }
      }

      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      obs.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [params, presences, store]);

  const onHautHoldStill = () => {
    if (store.getFrame().pointer.speed > 220) return;
    store.toggleDeltaZ();
  };

  return (
    <main className="streamRoot" aria-label="STR 3M">
      <canvas ref={canvasRef} className="streamCanvas" aria-hidden="true" />
      <HautPoint href="#/HAUT" label="Haut Point" onHoldStill={onHautHoldStill} />
      <div className="streamHint" aria-hidden="true">
        STR 3M
      </div>
    </main>
  );
}

