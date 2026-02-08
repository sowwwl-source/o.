import React, { useEffect, useMemo, useRef } from "react";
import "./board.css";
import { computeConstellation, edges, neighbors, type NodeId } from "@/graph/graph";
import { toggleInvert } from "@/theme/invert";
import { HautPoint } from "@/components/HautPoint";

const NODES: readonly Exclude<NodeId, "HAUT">[] = ["LAND", "FERRY", "STR3M", "CONTACT"];

function hrefFor(id: NodeId): string {
  return `#/${id}`;
}

function isInteractiveTarget(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return false;
  return Boolean(t.closest("a,button,input,textarea,select"));
}

function angleDegFromCenter(x: number, y: number): number {
  const rad = Math.atan2(y - 50, x - 50);
  const deg = (rad * 180) / Math.PI;
  const norm = (deg + 360) % 360;
  return Math.round(norm);
}

export function BoardPage(props: { active?: NodeId }) {
  const active = props.active ?? "HAUT";
  const positions = useMemo(() => computeConstellation(7), []);
  const near = useMemo(() => {
    if (active === "HAUT") return new Set(NODES);
    const ns = neighbors(active).filter((x) => x !== "HAUT") as Array<Exclude<NodeId, "HAUT">>;
    return new Set<Exclude<NodeId, "HAUT">>([...(ns || []), active as Exclude<NodeId, "HAUT">]);
  }, [active]);

  // Intention: press-and-hold on empty space toggles inversion. No explicit UI.
  const holdRef = useRef<{ t: number | null; fired: boolean }>({ t: null, fired: false });
  useEffect(() => {
    return () => {
      if (holdRef.current.t !== null) window.clearTimeout(holdRef.current.t);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const k = String(e.key || "").toLowerCase();
      if (k !== "i") return;
      if (isInteractiveTarget(e.target)) return;
      e.preventDefault();
      toggleInvert();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (isInteractiveTarget(e.target)) return;

    if (holdRef.current.t !== null) window.clearTimeout(holdRef.current.t);
    holdRef.current.fired = false;
    holdRef.current.t = window.setTimeout(() => {
      holdRef.current.fired = true;
      toggleInvert();
    }, 520);
  };

  const stopHold = () => {
    if (holdRef.current.t !== null) window.clearTimeout(holdRef.current.t);
    holdRef.current.t = null;
  };

  return (
    <main className="oBoard" aria-label="b0ard" data-active={active} onPointerDown={onPointerDown} onPointerUp={stopHold} onPointerCancel={stopHold}>
      <svg className="oEdges" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        {edges.map(([a, b]) => {
          const pa = positions[a];
          const pb = positions[b];
          const hot = active !== "HAUT" && (a === active || b === active);
          return (
            <line
              key={`${a}-${b}`}
              x1={pa.x}
              y1={pa.y}
              x2={pb.x}
              y2={pb.y}
              className={`oEdge ${hot ? "is-hot" : ""}`}
            />
          );
        })}
      </svg>

      <HautPoint href={hrefFor("HAUT")} label="Haut Point" />

      {NODES.map((id) => {
        const p = positions[id];
        const deg = angleDegFromCenter(p.x, p.y);
        const isActive = id === active;
        const isNear = near.has(id);
        return (
          <a
            key={id}
            href={hrefFor(id)}
            className={`oNode ${isNear ? "is-near" : ""} ${isActive ? "is-active" : ""}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            aria-label={id}
            data-node={id}
          >
            <span className="oNodeDot" aria-hidden="true">
              ·
            </span>
            <span className="oNodeText">{id}</span>
            <span className="oNodeDeg" aria-hidden="true">
              {deg}°
            </span>
          </a>
        );
      })}
    </main>
  );
}
