import { describe, expect, it } from "vitest";
import { blurModes, computeBlurLayers } from "../blurModes";

describe("computeBlurLayers", () => {
  it("clamps outputs to safety limits", () => {
    const m = blurModes.deltaZ;
    const b = computeBlurLayers(m, { d: 1, s: 1, depthIndex: 1, focusWeight: 0, tt: 0.5 });
    expect(b.orient).toBeLessThanOrEqual(m.clampOrient);
    expect(b.depth).toBeLessThanOrEqual(m.clampDepth);
    expect(b.threshold).toBeLessThanOrEqual(m.clampThreshold);
  });

  it("reduces intensity under reduced motion", () => {
    const m = blurModes.deltaZ;
    const a = computeBlurLayers(m, { d: 1, s: 1, depthIndex: 1, focusWeight: 0, tt: 0.5 });
    const b = computeBlurLayers(m, { d: 1, s: 1, depthIndex: 1, focusWeight: 0, tt: 0.5, reducedMotion: true });
    expect(b.orient).toBeLessThan(a.orient);
    expect(b.depth).toBeLessThan(a.depth);
    expect(b.threshold).toBeLessThan(a.threshold);
  });
});

