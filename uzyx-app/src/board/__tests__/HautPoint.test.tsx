import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { HautPoint } from "../HautPoint";

describe("HautPoint", () => {
  it("renders a focusable link", () => {
    render(<HautPoint href="/x" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/x");
  });

  it("starts hidden when not inverted", () => {
    render(<HautPoint />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("data-revealed")).toBe("0");
  });

  it("reveals when html is inverted", () => {
    document.documentElement.classList.add("is-inverted");
    render(<HautPoint />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("data-revealed")).toBe("1");
    document.documentElement.classList.remove("is-inverted");
  });

  it("can glitch-reveal while idle (timer)", () => {
    vi.useFakeTimers();
    render(<HautPoint />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("data-glitching")).toBe("0");
    vi.advanceTimersByTime(20050);
    const after = screen.getByRole("link");
    expect(["0", "1"]).toContain(after.getAttribute("data-glitching"));
    vi.useRealTimers();
  });
});
