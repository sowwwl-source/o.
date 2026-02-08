import { describe, expect, it } from "vitest";
import { computeFocusPhi } from "../focusPhi";

describe("computeFocusPhi", () => {
  it("picks the node aligned with pointer direction", () => {
    const nodes = [
      { id: "A", x: 0.82, y: 0.22 },
      { id: "B", x: 0.18, y: 0.78 },
      { id: "C", x: 0.78, y: 0.82 },
      { id: "D", x: 0.22, y: 0.18 },
    ];
    const f = computeFocusPhi(nodes, { x: 0.92, y: 0.1 });
    expect(f.id).toBe("A");
    expect(f.weight).toBeGreaterThan(0.25);
  });

  it("prefers prevFocus when ambiguous near center", () => {
    const nodes = [
      { id: "LAND", x: 0.18, y: 0.78 },
      { id: "FERRY", x: 0.82, y: 0.78 },
      { id: "STR3M", x: 0.82, y: 0.22 },
      { id: "CONTACT", x: 0.18, y: 0.22 },
    ];
    const f = computeFocusPhi(nodes, { x: 0.5, y: 0.5 }, "STR3M");
    expect(f.id).toBe("STR3M");
  });
});

