import React, { useEffect, useMemo, useRef } from "react";
import "./stream.css";
import { getPresences, initPoints, stepPoints, type StreamParams, type StreamPoint } from "./streamEngine";

const DEFAULT_PARAMS: StreamParams = {
  density: 1400,
  speed: 0.6,
  amplitude: 16,
  revealRate: 0.35,
};

export function StreamPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const pointsRef = useRef<StreamPoint[]>([]);
  const params = useMemo(() => DEFAULT_PARAMS, []);
  const presences = useMemo(() => getPresences(22), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const perf = w * h > 1_200_000 ? 0.7 : 1;
      const density = Math.max(800, Math.floor(params.density * perf));
      pointsRef.current = initPoints(w, h, density, presences);
    };

    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();

    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      stepPoints(pointsRef.current, w, h, now, params);
      render(ctx, pointsRef.current, now, params);

      if (dt < 60) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = requestAnimationFrame(loop);
      }
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [params, presences]);

  return (
    <div className="streamRoot">
      <canvas ref={canvasRef} className="streamCanvas" />
      <div className="streamHint">STR 3M</div>
    </div>
  );
}

function render(
  ctx: CanvasRenderingContext2D,
  points: StreamPoint[],
  t: number,
  params: StreamParams
) {
  ctx.fillStyle = "var(--fg)";
  ctx.globalAlpha = 0.8;
  for (const p of points) {
    ctx.fillRect(p.x, p.y, 1.2, 1.2);
  }

  const reveal = (Math.sin(t * 0.0007) + 1) * 0.5 * params.revealRate;
  ctx.globalAlpha = 0.5;
  ctx.font = "11px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

  for (const p of points) {
    if (!p.presence) continue;
    if (Math.random() > reveal) continue;
    const pulse = 0.4 + Math.sin(t * 0.004 + p.phase) * 0.6;
    ctx.globalAlpha = 0.25 + pulse * 0.35;
    ctx.fillText(p.presence.pseudo, p.x + 4, p.y - 2);
    ctx.fillRect(p.x - 1, p.y - 1, 2.2, 2.2);
  }
  ctx.globalAlpha = 1;
}
