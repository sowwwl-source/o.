import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminMagicPage } from "../AdminMagicPage";

const FAST_ADMIN_EMAIL = "0wlslw0@protonmail.com";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  refresh: vi.fn(),
  dispatch: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock("@/api/apiClient", async () => {
  const actual = await vi.importActual<typeof import("@/api/apiClient")>("@/api/apiClient");
  return {
    ...actual,
    apiRequest: mocks.apiRequest,
  };
});

vi.mock("@/api/sessionStore", () => ({
  useSession: () => mocks.useSession(),
}));

vi.mock("@/oNote/oNote.hooks", () => ({
  useOEvent: () => mocks.dispatch,
}));

describe("AdminMagicPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.location.hash = "#/admin/magic";
    mocks.useSession.mockReturnValue({
      state: { phase: "guest" },
      api: { refresh: mocks.refresh },
    });
    mocks.apiRequest.mockResolvedValue({ ok: true, status: 200, data: { status: "ok" } });
  });

  it("defaults the admin email to the fast target", () => {
    render(<AdminMagicPage />);

    expect(screen.getByRole("textbox", { name: "email" })).toHaveValue(FAST_ADMIN_EMAIL);
  });

  it("sends the fast admin address with one click", async () => {
    render(<AdminMagicPage />);

    fireEvent.click(screen.getByRole("link", { name: "fast send" }));

    await waitFor(() =>
      expect(mocks.apiRequest).toHaveBeenCalledWith("/auth/admin/magic/send", {
        method: "POST",
        json: { email: FAST_ADMIN_EMAIL },
      })
    );
  });
});
