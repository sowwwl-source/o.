import { useMemo, useSyncExternalStore } from "react";
import type { ApiErr, ApiOk } from "./apiClient";
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
  return r.status === 401 && Boolean((r.data as any)?.guest);
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
        setState({ phase: "authed", me: (r as ApiOk<MeResponse>).data });
        return;
      }
      const err = r as ApiErr;
      if (isGuestErr(err)) {
        setState({ phase: "guest" });
        return;
      }
      const msg = String((err.data as any)?.error || (err.data as any)?.detail || `http_${err.status || 0}`);
      setState({ phase: "error", error: msg });
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

