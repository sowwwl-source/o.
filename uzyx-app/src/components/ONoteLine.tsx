import React, { useEffect } from "react";
import "./oNoteLine.css";
import { resolveCopy } from "@/oNote/oNote.math";
import { useONote } from "@/oNote/oNoteStore";
import { oNoteStore } from "@/oNote/oNoteStore";

export function ONoteLine(props: { align?: "left" | "right"; muted?: boolean } = {}) {
  const { state } = useONote();
  const display = state.copy ?? resolveCopy(state.o, state.floor);
  const align = props.align ?? "left";
  const muted = props.muted ? "is-muted" : "";

  useEffect(() => {
    if (!state.copy) return;
    const t = window.setTimeout(() => oNoteStore.clearCopy(), 2100);
    return () => window.clearTimeout(t);
  }, [state.copy, state.lastEvent]);

  return (
    <div className={`oNoteLine ${muted}`} data-align={align} aria-label="o n0t3">
      <span className="oNoteKey" aria-hidden="true">
        o n0t3
      </span>
      <span className="oNoteVal" aria-hidden="true">
        {state.o}
      </span>
      <span className="oNoteSep" aria-hidden="true">
        ·
      </span>
      <span className="oNoteText">{display.text}</span>
    </div>
  );
}
