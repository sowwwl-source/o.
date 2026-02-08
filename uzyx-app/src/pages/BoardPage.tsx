import React, { useEffect, useMemo, useRef, useState } from "react";
import "./board.css";
import { computeConstellation, edges, neighbors, type NodeId } from "@/graph/graph";
import { toggleInvert } from "@/theme/invert";
import { ODot } from "@/components/ODot";
import { usePerceptionFrame, usePerceptionStore } from "@/perception/PerceptionProvider";
import { usePreviewNav } from "@/engines/previewNav";

const NODES: readonly Exclude<NodeId, "HAUT">[] = ["LAND", "FERRY", "STR3M", "CONTACT"];

const BLOC = {
  LAND: { bloc: "BL0C_A", destination: "LAND", hint: "1nv3rs10n", anchorX: "0%", anchorY: "0%", align: "left" },
  FERRY: { bloc: "BL0C_B", destination: "FERRY", hint: "+prs3nc3", anchorX: "-100%", anchorY: "0%", align: "right" },
  CONTACT: { bloc: "BL0C_C", destination: "1n1tc(o)ntact", hint: "r3p3rt01r3", anchorX: "0%", anchorY: "-100%", align: "left" },
  STR3M: { bloc: "BL0C_D", destination: "STR 3M", hint: "p01nts + d3grés", anchorX: "-100%", anchorY: "-100%", align: "right" },
} as const satisfies Record<Exclude<NodeId, "HAUT">, { bloc: string; destination: string; hint: string; anchorX: string; anchorY: string; align: "left" | "right" }>;

function hrefFor(id: NodeId): string {
  return `#/${id}`;
}

function isInteractiveTarget(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return false;
  return Boolean(t.closest("a,button,input,textarea,select"));
}

export function BoardPage(props: { active?: NodeId }) {
  const active = props.active ?? "HAUT";
  const positions = useMemo(() => computeConstellation(7), []);
  const near = useMemo(() => {
    if (active === "HAUT") return new Set(NODES);
    const ns = neighbors(active).filter((x) => x !== "HAUT") as Array<Exclude<NodeId, "HAUT">>;
    return new Set<Exclude<NodeId, "HAUT">>([...(ns || []), active as Exclude<NodeId, "HAUT">]);
  }, [active]);

  const store = usePerceptionStore();
  const frame = usePerceptionFrame();

  const preview = usePreviewNav({
    durationMs: 820,
    getReducedMotion: () => store.getReducedMotion(),
    navigate: (href) => {
      window.location.hash = href;
    },
  });

  useEffect(() => {
    store.setBaseProfile("board");
  }, [store]);

  // Intention: press-and-hold on empty space toggles inversion. No explicit UI.
  const holdRef = useRef<{ t: number | null; fired: boolean }>({ t: null, fired: false });
  useEffect(() => {
    return () => {
      if (holdRef.current.t !== null) window.clearTimeout(holdRef.current.t);
    };
  }, []);

  const boardRef = useRef<HTMLElement | null>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number }>({ w: 1, h: 1 });

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const resize = () => {
      const r = el.getBoundingClientRect();
      setViewport({ w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) });
    };
    resize();
    const ro = "ResizeObserver" in window ? new ResizeObserver(() => resize()) : null;
    ro?.observe(el);
    window.addEventListener("resize", resize, { passive: true });
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", resize);
    };
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

  const onHautHoldStill = () => {
    // ΔZ′ entry only via Haut Point + stillness (avoid accidental activation).
    if (frame.pointer.speed > 220) return;
    store.toggleDeltaZ();
  };

  const blend = frame.stateBlend;
  const perception = blend > 0.58 ? "deltaZ" : "board";
  const bgWarpK = (1 - frame.focus.weight) * (0.35 + 0.65 * blend);
  const bgWarp = { x: frame.dir.x * 10 * bgWarpK, y: frame.dir.y * 10 * bgWarpK };

  return (
    <main
      ref={boardRef}
      className="oBoard"
      aria-label="b0ard"
      data-active={active}
      data-perception={perception}
      data-dz={blend > 0.04 ? "1" : "0"}
      data-previewing={preview.state.phase === "preview" ? "1" : "0"}
      data-preview-target={preview.state.targetId ?? ""}
      style={
        {
          ["--state-blend" as any]: String(blend.toFixed(3)),
          ["--bg-warp-x" as any]: `${bgWarp.x.toFixed(2)}px`,
          ["--bg-warp-y" as any]: `${bgWarp.y.toFixed(2)}px`,
        } as React.CSSProperties
      }
      onPointerDown={onPointerDown}
      onPointerUp={stopHold}
      onPointerCancel={stopHold}
    >
      <svg className="oEdges" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        {edges.map(([a, b]) => {
          const pa = positions[a];
          const pb = positions[b];
          const wa = frame.nodes[a]?.warpPx;
          const wb = frame.nodes[b]?.warpPx;
          const dxA = wa ? (wa.x / Math.max(1, viewport.w)) * 100 : 0;
          const dyA = wa ? (wa.y / Math.max(1, viewport.h)) * 100 : 0;
          const dxB = wb ? (wb.x / Math.max(1, viewport.w)) * 100 : 0;
          const dyB = wb ? (wb.y / Math.max(1, viewport.h)) * 100 : 0;
          const hot = active !== "HAUT" && (a === active || b === active);
          return (
            <line
              key={`${a}-${b}`}
              x1={pa.x + dxA}
              y1={pa.y + dyA}
              x2={pb.x + dxB}
              y2={pb.y + dyB}
              className={`oEdge ${hot ? "is-hot" : ""}`}
            />
          );
        })}
      </svg>

      <ODot href="#/cloud" onHoldStill={onHautHoldStill} />

      {NODES.map((id) => {
        const p = positions[id];
        const meta = BLOC[id];
        const isActive = id === active;
        const isNear = near.has(id);
        const m = frame.nodes[id];
        return (
          <a
            key={id}
            href={hrefFor(id)}
            className={`oNode ${isNear ? "is-near" : ""} ${isActive ? "is-active" : ""}`}
            style={
              {
                left: `${p.x}%`,
                top: `${p.y}%`,
                ["--anchor-x" as any]: meta.anchorX,
                ["--anchor-y" as any]: meta.anchorY,
                ["--warp-x" as any]: m ? `${m.warpPx.x.toFixed(2)}px` : "0px",
                ["--warp-y" as any]: m ? `${m.warpPx.y.toFixed(2)}px` : "0px",
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
            aria-label={`${meta.destination}. ${meta.hint}`}
            data-node={id}
            data-bloc={meta.bloc}
            data-align={meta.align}
            onClick={(e) => {
              if (e.defaultPrevented) return;
              if (preview.busy) {
                e.preventDefault();
                return;
              }
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              preview.begin(id, hrefFor(id));
            }}
          >
            <span className="oNodeMatter">
              <span className="oBlocTitle" aria-hidden="true">
                [ {meta.bloc} ]
              </span>
              <span className="oBlocRow" aria-hidden="true">
                <span className="oBlocKey">destination</span>
                <span className="oBlocVal">{meta.destination}</span>
              </span>
              <span className="oBlocRow" aria-hidden="true">
                <span className="oBlocKey">hint</span>
                <span className="oBlocVal">{meta.hint}</span>
              </span>
            </span>
          </a>
        );
      })}
    </main>
  );
}
