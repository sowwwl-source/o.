import { describe, expect, it } from "vitest";
import { assertNoImagesInDOM } from "../noImages";

describe("assertNoImagesInDOM", () => {
  it("throws if an image tag exists", () => {
    const root = document.createElement("div");
    root.appendChild(document.createElement("img"));
    expect(() => assertNoImagesInDOM(root)).toThrow();
  });
});

