import { useMemo } from "react";
import type { OEvent, OScore, ORenderMode } from "./oNote.types";
import { resolveCopy } from "./oNote.math";
import { useONoteAPI, useONoteState } from "./oNote.store";

export function useOCopy(min_o?: OScore): { text: string; mode: ORenderMode; o: OScore } {
  const state = useONoteState();
  const copy = useMemo(() => resolveCopy(state.o_score, min_o), [state.o_score, min_o]);
  return { text: copy.text, mode: copy.mode, o: copy.o };
}

export function useOEvent(): (event: OEvent) => void {
  const { dispatch } = useONoteAPI();
  return dispatch;
}
