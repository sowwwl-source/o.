import { useEffect } from "react";
import type { OScore } from "./oNote.types";
import { oNoteStore } from "./oNoteStore";

export function useONoteFloor(min: OScore): void {
  useEffect(() => {
    const token = oNoteStore.pushFloor(min);
    return () => oNoteStore.popFloor(token);
  }, [min]);
}

