import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminBoardPage } from "../AdminBoardPage";

const mocks = vi.hoisted(() => ({
  apiQu3stGet: vi.fn(),
  apiQu3stSave: vi.fn(),
  apiAuthLogout: vi.fn(),
  refresh: vi.fn(),
  setGuest: vi.fn(),
  dispatch: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock("@/api/apiClient", async () => {
  const actual = await vi.importActual<typeof import("@/api/apiClient")>("@/api/apiClient");
  return {
    ...actual,
    apiQu3stGet: mocks.apiQu3stGet,
    apiQu3stSave: mocks.apiQu3stSave,
    apiAuthLogout: mocks.apiAuthLogout,
  };
});

vi.mock("@/api/sessionStore", () => ({
  useSession: () => mocks.useSession(),
}));

vi.mock("@/oNote/oNote.hooks", () => ({
  useOEvent: () => mocks.dispatch,
}));

describe("AdminBoardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = "#/admin";
  });

  it("redirects guests to the admin magic page", async () => {
    mocks.useSession.mockReturnValue({
      state: { phase: "guest" },
      api: { refresh: mocks.refresh, setGuest: mocks.setGuest },
    });

    render(<AdminBoardPage />);

    await waitFor(() => expect(window.location.hash).toBe("#/admin/magic"));
  });

  it("loads and saves qu3st content for admins", async () => {
    mocks.useSession.mockReturnValue({
      state: {
        phase: "authed",
        me: {
          user: {
            id: 1,
            email: "0wlslw0@protonmail.com",
            handle: "owl",
            comm_address: "O.OWL",
            network_admin: true,
          },
        },
      },
      api: { refresh: mocks.refresh, setGuest: mocks.setGuest },
    });
    mocks.apiQu3stGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: { qu3st: { content: "alpha", updated_at: "2026-03-14T00:00:00Z" } },
    });
    mocks.apiQu3stSave.mockResolvedValue({
      ok: true,
      status: 200,
      data: { status: "saved" },
    });

    render(<AdminBoardPage />);

    const textarea = await screen.findByRole("textbox", { name: "qu3st content" });
    expect(textarea).toHaveValue("alpha");

    fireEvent.change(textarea, { target: { value: "beta" } });
    fireEvent.click(screen.getByRole("link", { name: "save qu3st" }));

    await waitFor(() => expect(mocks.apiQu3stSave).toHaveBeenCalledWith("beta"));
    expect(await screen.findByText("sauvé")).toBeInTheDocument();
  });
});
