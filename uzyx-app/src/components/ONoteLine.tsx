import React from "react";
import "./oNoteLine.css";
import type { OScore } from "@/oNote/oNote.types";
import { useOCopy } from "@/oNote/oNote.hooks";

export function ONoteLine(props: { align?: "left" | "right"; muted?: boolean; min_o?: OScore } = {}) {
  const display = useOCopy(props.min_o);
  const align = props.align ?? "left";
  const muted = props.muted ? "is-muted" : "";

  return (
    <div className={`oNoteLine ${muted}`} data-align={align} aria-label="o n0t3">
      <span className="oNoteKey" aria-hidden="true">
        o n0t3
      </span>
      <span className="oNoteVal" aria-hidden="true">
        {display.o}
      </span>
      <span className="oNoteSep" aria-hidden="true">
        ·
      </span>
      <span className="oNoteText">{display.text}</span>
    </div>
  );
}
