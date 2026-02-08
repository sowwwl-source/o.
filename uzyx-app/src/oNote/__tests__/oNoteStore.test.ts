import { describe, expect, it } from "vitest";
import { oNoteStore } from "../oNoteStore";

describe("oNoteStore", () => {
  it("clamps to floor", () => {
    oNoteStore.reset();
    const tok = oNoteStore.pushFloor(5);
    expect(oNoteStore.get().o).toBe(5);
    oNoteStore.setO(2);
    expect(oNoteStore.get().o).toBe(5);
    oNoteStore.popFloor(tok);
  });

  it("triggers repeated_error_threshold on streak", () => {
    oNoteStore.reset();
    oNoteStore.setO(6);
    oNoteStore.emit("network_error", "short");
    oNoteStore.emit("network_error", "short");
    const before = oNoteStore.get().o;
    oNoteStore.emit("network_error", "short");
    const s = oNoteStore.get();
    expect(s.lastEvent).toBe("repeated_error_threshold");
    expect(s.o).toBeLessThanOrEqual(before);
  });
});

