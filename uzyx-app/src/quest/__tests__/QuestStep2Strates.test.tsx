import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestStep2Strates } from "../QuestStep2Strates";

const EQUATION_TEXT = [
  "Ψ = 𝔈_τ( 𝕄( 𝔊(X) ) )",
  "",
  "r(θ) = a e^{bθ}",
  "x_{t+1} = σ(Ax_t + u_t)",
  "y_t = 𝕄(x_t)",
  "Ψ_t = y_t + λ y_{t-τ}",
].join("\n");

describe("QuestStep2Strates", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("switches modes and mystery state from the keyboard", () => {
    render(<QuestStep2Strates />);

    const root = screen.getByLabelText("nautilus octopus");
    expect(root).toHaveAttribute("data-mode", "vb");
    expect(root).toHaveAttribute("data-mystery", "off");

    fireEvent.keyDown(window, { key: "3" });
    expect(root).toHaveAttribute("data-mode", "eq");
    expect(screen.getByLabelText("strates content")).toHaveTextContent("Ψ = 𝔈_τ( 𝕄( 𝔊(X) ) )");

    fireEvent.keyDown(window, { key: "m" });
    expect(root).toHaveAttribute("data-mystery", "on");
  });

  it("copies the formula and clears the note after the timer", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<QuestStep2Strates />);

    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "copy formula" }));
    });

    expect(writeText).toHaveBeenCalledWith(EQUATION_TEXT);
    expect(screen.getByText("copié")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(document.querySelector(".qS2Note")?.textContent).toBe(" ");
  });
});
