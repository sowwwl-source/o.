import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CloudGatePage } from "../CloudGatePage";

const mocks = vi.hoisted(() => ({
  apiSoulTokenGet: vi.fn(),
  apiSoulTokenSet: vi.fn(),
  apiSoulUpload: vi.fn(),
  refresh: vi.fn(),
  dispatch: vi.fn(),
  useSession: vi.fn(),
  setBaseProfile: vi.fn(),
}));

vi.mock("@/api/apiClient", async () => {
  const actual = await vi.importActual<typeof import("@/api/apiClient")>("@/api/apiClient");
  return {
    ...actual,
    apiSoulTokenGet: mocks.apiSoulTokenGet,
    apiSoulTokenSet: mocks.apiSoulTokenSet,
    apiSoulUpload: mocks.apiSoulUpload,
  };
});

vi.mock("@/api/sessionStore", () => ({
  useSession: () => mocks.useSession(),
}));

vi.mock("@/oNote/oNote.hooks", () => ({
  useOEvent: () => mocks.dispatch,
}));

vi.mock("@/perception/PerceptionProvider", () => ({
  usePerceptionStore: () => ({
    setBaseProfile: mocks.setBaseProfile,
  }),
}));

vi.mock("@/app/env", () => ({
  getDomainEnv: () => ({
    host: "0.user.o.sowwwl.cloud",
    requireSshPrincipal: true,
  }),
}));

describe("CloudGatePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.location.hash = "#/cloud";

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
      api: { refresh: mocks.refresh },
    });
    mocks.apiSoulTokenGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        token_set: true,
        token_hint: "tok...1234",
        updated_at: "2026-03-14T09:26:53Z",
      },
    });
    mocks.apiSoulTokenSet.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        ok: true,
        token_hint: "tok...9999",
      },
    });
    mocks.apiSoulUpload.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        ok: true,
        upload_id: 7,
        archive: {
          name: "many-things.zip",
          bytes: 4,
          sha256: "abc123",
        },
        stored: {
          scope: "soul.cloud",
          path: "soul.cloud/1/uploads/abc.zip",
          manifest: true,
        },
      },
    });
  });

  it("redirects guests to entry", async () => {
    mocks.useSession.mockReturnValue({
      state: { phase: "guest" },
      api: { refresh: mocks.refresh },
    });

    render(<CloudGatePage />);

    await waitFor(() => expect(window.location.hash).toBe("#/entry"));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("loads and saves the soul token", async () => {
    mocks.apiSoulTokenGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: { token_set: false },
    });

    render(<CloudGatePage />);

    await screen.findByText("not_set");

    const tokenInput = screen.getByRole("textbox", { name: "soul token" });
    fireEvent.change(tokenInput, { target: { value: "secret-token" } });
    fireEvent.click(screen.getByRole("link", { name: "save soul token" }));

    await waitFor(() => expect(mocks.apiSoulTokenSet).toHaveBeenCalledWith("secret-token", undefined));
    expect(tokenInput).toHaveValue("");
    expect(await screen.findByText("tok...9999")).toBeInTheDocument();
  });

  it("uploads a selected zip and shows the stored path", async () => {
    render(<CloudGatePage />);

    await screen.findByText("tok...1234");

    const zip = new File([new Uint8Array([80, 75, 3, 4])], "many-things.zip", {
      type: "application/zip",
    });

    fireEvent.change(screen.getByLabelText("files to send"), {
      target: { files: [zip] },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "manifest note" }), {
      target: { value: "plein de choses" },
    });
    fireEvent.click(screen.getByRole("link", { name: "upload archive" }));

    await waitFor(() => expect(mocks.apiSoulUpload).toHaveBeenCalled());

    const [archiveArg, manifestArg] = mocks.apiSoulUpload.mock.calls[0];
    expect(archiveArg).toBe(zip);
    expect(manifestArg).toMatchObject({
      note: "plein de choses",
      file_count: 1,
      token_hint: "tok...1234",
    });
    expect(await screen.findByText("soul.cloud/1/uploads/abc.zip")).toBeInTheDocument();
  });
});
