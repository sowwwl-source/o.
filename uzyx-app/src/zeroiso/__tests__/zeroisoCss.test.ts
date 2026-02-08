import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("zeroiso.css", () => {
  it("is bicolour-only (no accent/halo, no hardcoded colors)", () => {
    const cssPath = path.resolve(process.cwd(), "src/zeroiso/zeroiso.css");
    const css = readFileSync(cssPath, "utf8");
    expect(css).not.toMatch(/--accent|--halo/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/\brgb\(/i);
    expect(css).not.toMatch(/\bhsl\(/i);
  });
});
