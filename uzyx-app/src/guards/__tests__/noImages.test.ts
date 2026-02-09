import { describe, expect, it } from "vitest";
import { assertNoImagesInDOM } from "../noImages";

describe("assertNoImagesInDOM", () => {
  it("throws if an image tag exists", () => {
    const root = document.createElement("div");
    root.appendChild(document.createElement("img"));
    expect(() => assertNoImagesInDOM(root)).toThrow();
  });

  it("allows images inside an explicitly-allowed interior scope", () => {
    const root = document.createElement("div");
    const land = document.createElement("section");
    land.setAttribute("data-o-allow-images", "true");
    const img = document.createElement("img");
    land.appendChild(img);
    root.appendChild(land);
    expect(() => assertNoImagesInDOM(root, { allowIn: "[data-o-allow-images='true']" })).not.toThrow();
  });

  it("still blocks images outside the allowed scope", () => {
    const root = document.createElement("div");
    const land = document.createElement("section");
    land.setAttribute("data-o-allow-images", "true");
    land.appendChild(document.createElement("img"));
    root.appendChild(land);
    root.appendChild(document.createElement("img"));
    expect(() => assertNoImagesInDOM(root, { allowIn: "[data-o-allow-images='true']" })).toThrow();
  });
});
