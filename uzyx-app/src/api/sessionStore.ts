import { useMemo, useSyncExternalStore } from "react";
import type { ApiErr } from "./apiClient";
import { apiMe, type MeResponse } from "./apiClient";

export type SessionState =
  | { phase: "unknown" }
  | { phase: "checking" }
  | { phase: "guest" }
  | { phase: "authed"; me: MeResponse }
  | { phase: "error"; error: string };

type Listener = () => void;

const listeners = new Set<Listener>();
let state: SessionState = { phase: "unknown" };
let inflight: Promise<void> | null = null;

function broadcast() {
  for (const l of listeners) l();
}

function setState(next: SessionState) {
  state = next;
  broadcast();
}

function isGuestErr(r: ApiErr): boolean {
  return r.status === 401 && r.data.guest === true;
}

function apiErrorMessage(r: ApiErr): string {
  if (typeof r.data.error === "string" && r.data.error) return r.data.error;
  if (typeof r.data.detail === "string" && r.data.detail) return r.data.detail;
  return `http_${r.status || 0}`;
}

export const sessionStore = {
  get(): SessionState {
    return state;
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  async refresh(): Promise<SessionState> {
    if (inflight) {
      await inflight;
      return state;
    }

    setState({ phase: "checking" });
    inflight = (async () => {
      const r = await apiMe();
      if (r.ok) {
        setState({ phase: "authed", me: r.data });
        return;
      }
      if (isGuestErr(r)) {
        setState({ phase: "guest" });
        return;
      }
      setState({ phase: "error", error: apiErrorMessage(r) });
    })().finally(() => {
      inflight = null;
    });

    await inflight;
    return state;
  },
  setGuest(): void {
    setState({ phase: "guest" });
  },
};

export function useSession(): { state: SessionState; api: typeof sessionStore } {
  const s = useSyncExternalStore(sessionStore.subscribe, sessionStore.get, sessionStore.get);
  return useMemo(() => ({ state: s, api: sessionStore }), [s]);
}
