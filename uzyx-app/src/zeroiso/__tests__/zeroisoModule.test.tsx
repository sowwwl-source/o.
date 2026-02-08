import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ZeroisoModule } from "../ZeroisoModule";

describe("ZeroisoModule", () => {
  it("never renders img/picture/source in the module UI", () => {
    const { container } = render(<ZeroisoModule handle="test" initialSeed="seedseedseedseed" />);
    expect(container.querySelectorAll("img, picture, source").length).toBe(0);
  });
});
