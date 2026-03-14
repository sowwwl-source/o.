import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeResponse } from "@/api/apiClient";

const mocks = vi.hoisted(() => ({
  apiMe: vi.fn(),
}));

vi.mock("@/api/apiClient", async () => {
  const actual = await vi.importActual<typeof import("@/api/apiClient")>("@/api/apiClient");
  return {
    ...actual,
    apiMe: mocks.apiMe,
  };
});

const ME: MeResponse = {
  user: {
    id: 7,
    email: "owl@example.test",
    handle: "owl",
    comm_address: "O.OWL",
  },
  csrf: "csrf-token",
};

async function loadSessionStore() {
  const mod = await import("../sessionStore");
  return mod.sessionStore;
}

describe("sessionStore", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("moves to guest on a guest 401 response", async () => {
    mocks.apiMe.mockResolvedValue({ ok: false, status: 401, data: { guest: true } });
    const sessionStore = await loadSessionStore();

    const state = await sessionStore.refresh();

    expect(state).toEqual({ phase: "guest" });
    expect(sessionStore.get()).toEqual({ phase: "guest" });
  });

  it("uses API detail when refresh fails", async () => {
    mocks.apiMe.mockResolvedValue({ ok: false, status: 503, data: { detail: "maintenance" } });
    const sessionStore = await loadSessionStore();

    const state = await sessionStore.refresh();

    expect(state).toEqual({ phase: "error", error: "maintenance" });
  });

  it("deduplicates concurrent refresh calls", async () => {
    mocks.apiMe.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ ok: true, status: 200, data: ME }), 0);
        })
    );
    const sessionStore = await loadSessionStore();

    const [a, b] = await Promise.all([sessionStore.refresh(), sessionStore.refresh()]);

    expect(mocks.apiMe).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ phase: "authed", me: ME });
    expect(b).toEqual({ phase: "authed", me: ME });
  });
});
