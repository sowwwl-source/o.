import React from "react";
import { act, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { HautPoint } from "@/components/HautPoint";

describe("HautPoint", () => {
  it("renders a focusable link", () => {
    render(<HautPoint href="/x" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/x");
  });

  it("starts hidden when not inverted", () => {
    document.documentElement.dataset.invert = "false";
    render(<HautPoint />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("data-revealed")).toBe("0");
  });

  it("reveals when html is inverted (data-invert)", () => {
    document.documentElement.dataset.invert = "true";
    render(<HautPoint />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("data-revealed")).toBe("1");
    document.documentElement.dataset.invert = "false";
  });

  it("can glitch-reveal while idle (timer)", () => {
    vi.useFakeTimers();
    document.documentElement.dataset.invert = "false";
    render(<HautPoint />);
    expect(screen.getByRole("link").getAttribute("data-glitching")).toBe("0");
    act(() => vi.advanceTimersByTime(24000));
    expect(screen.getByRole("link").getAttribute("data-glitching")).toBe("1");
    act(() => vi.advanceTimersByTime(80));
    expect(screen.getByRole("link").getAttribute("data-glitching")).toBe("0");
    vi.useRealTimers();
  });
});
