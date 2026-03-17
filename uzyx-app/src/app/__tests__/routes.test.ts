import { describe, expect, it } from "vitest";
import { parseRouteFromHash } from "@/app/routes";

describe("parseRouteFromHash", () => {
  it("decodes profile handles when the segment is well-formed", () => {
    expect(parseRouteFromHash("#/u/Jean%20O")).toEqual({ kind: "profile", handle: "Jean O" });
  });

  it("keeps malformed encoded handles as raw text instead of throwing", () => {
    expect(parseRouteFromHash("#/u/%E0%A4%A")).toEqual({ kind: "profile", handle: "%E0%A4%A" });
  });

  it("preserves legacy root node routes", () => {
    expect(parseRouteFromHash("#/LAND")).toEqual({ kind: "app", id: "LAND" });
  });
});
