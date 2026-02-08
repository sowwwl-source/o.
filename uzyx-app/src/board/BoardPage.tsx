import React, { useMemo } from "react";
import "./board.css";
import { useBoardLayout, type BoardBlockData } from "./useBoardLayout";
import { usePreviewNavigation } from "./usePreviewNavigation";
import { HautPoint } from "./HautPoint";

const BLOCKS: Array<BoardBlockData & { href: string }> = [
  { id: "land", title: "Land", subtitle: "territoire actif", href: "#/board" },
  { id: "bote", title: "B0te", subtitle: "ecriture lente", href: "#/stream" },
  { id: "signal", title: "Signal", subtitle: "presences", href: "#/stream" },
  { id: "salon", title: "Sal0n", subtitle: "connexions", href: "#/ferry" },
  { id: "archive", title: "Archive", subtitle: "memoire", href: "#/contacts" },
];

export function BoardPage() {
  const layout = useBoardLayout(BLOCKS, { seed: 7 });
  const preview = usePreviewNavigation({
    durationMs: 820,
    onNavigate: (href) => {
      if (href.startsWith("#")) {
        window.location.hash = href.replace("#", "");
      } else {
        window.location.href = href;
      }
    },
  });
  const blocks = useMemo(
    () =>
      BLOCKS.map((b) => ({
        ...b,
        pos: layout.positions[b.id],
      })),
    [layout.positions]
  );

  return (
    <main
      className={`board ${preview.state.phase === "animating" ? "is-animating" : ""}`}
      data-active={preview.state.activeId ?? ""}
    >
      <div className="boardStage" aria-hidden="true" />
      <div className="boardCenter" aria-hidden="true" />
      <HautPoint />

      {blocks.map((b) => (
        <BoardBlock
          key={b.id}
          title={b.title}
          subtitle={b.subtitle}
          x={b.pos.x}
          y={b.pos.y}
          toX={(50 - b.pos.x) * 0.4}
          toY={(50 - b.pos.y) * 0.4}
          isActive={preview.state.activeId === b.id}
          isFading={preview.state.phase === "animating" && preview.state.activeId !== b.id}
          onClick={() => preview.start(b.id, b.href)}
          ariaLabel={`${b.title}${b.subtitle ? `, ${b.subtitle}` : ""}`}
        />
      ))}
    </main>
  );
}

function BoardBlock(props: {
  title: string;
  subtitle?: string;
  x: number;
  y: number;
  toX: number;
  toY: number;
  isActive: boolean;
  isFading: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  const { title, subtitle, x, y, toX, toY, isActive, isFading, onClick, ariaLabel } = props;
  return (
    <button
      className={`boardBlock ${isActive ? "is-active" : ""} ${isFading ? "is-fading" : ""}`}
      style={{
        left: `${x}vw`,
        top: `${y}vh`,
        ["--to-x" as any]: `${toX}vw`,
        ["--to-y" as any]: `${toY}vh`,
      }}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <div className="boardTitle">{title}</div>
      {subtitle ? <div className="boardSubtitle">{subtitle}</div> : null}
    </button>
  );
}
