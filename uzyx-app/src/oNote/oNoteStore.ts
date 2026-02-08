import { useMemo, useSyncExternalStore } from "react";
import type { OCopy, OEvent, OScore, ORenderMode } from "./oNote.types";
import { applyDelta, pickCopy } from "./oNoteTable";

export type ONState = {
  o: OScore;
  floor: OScore;
  mode: ORenderMode;
  copy: OCopy | null;
  lastEvent: OEvent | null;
};

type Listener = () => void;

const LS_KEY = "sowwwl:oNote:v1";

function clampScore(n: number): OScore {
  const v = Math.max(0, Math.min(11, Math.round(n)));
  return v as OScore;
}

function loadInitialO(): OScore {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    const o = typeof parsed?.o === "number" ? parsed.o : 0;
    return clampScore(o);
  } catch {
    return 0;
  }
}

function saveO(o: OScore): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ o }));
  } catch {
    // ignore
  }
}

function isStreakErrorEvent(evt: OEvent): boolean {
  return evt === "network_error" || evt === "form_validation_error" || evt === "auth_passkey_failed";
}

function shouldOverrideCopy(evt: OEvent): boolean {
  return (
    evt === "network_error" ||
    evt === "form_validation_error" ||
    evt === "auth_passkey_failed" ||
    evt === "auth_passkey_cancelled" ||
    evt === "repeated_error_threshold"
  );
}

const listeners = new Set<Listener>();
const floors = new Map<string, OScore>();

let rawO: OScore = loadInitialO();
let mode: ORenderMode = "plain";
let copy: OCopy | null = null;
let lastEvent: OEvent | null = null;
let state: ONState = { o: rawO, floor: 0, mode, copy, lastEvent };

let errStreak = 0;
let errWindowStartedAt = 0;

function computeFloor(): OScore {
  let f: OScore = 0;
  for (const v of floors.values()) {
    if (v > f) f = v;
  }
  return f;
}

function effectiveO(floor: OScore): OScore {
  return rawO < floor ? floor : rawO;
}

function refreshState(): ONState {
  const floor = computeFloor();
  state = { o: effectiveO(floor), floor, mode, copy, lastEvent };
  return state;
}

function broadcast() {
  for (const l of listeners) l();
}

function commit() {
  refreshState();
  broadcast();
}

refreshState();

export const oNoteStore = {
  get(): ONState {
    return state;
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  pushFloor(min: OScore): string {
    const token = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}`;
    floors.set(token, min);
    commit();
    return token;
  },
  popFloor(token: string): void {
    if (!floors.has(token)) return;
    floors.delete(token);
    commit();
  },
  setMode(nextMode: ORenderMode): void {
    // note: does not change the effective score
    mode = nextMode;
    commit();
  },
  clearCopy(): void {
    copy = null;
    commit();
  },
  emit(event: OEvent, modeOverride: ORenderMode | undefined = undefined): void {
    const now = Date.now();
    const floor = computeFloor();
    const base = effectiveO(floor);
    const useMode = modeOverride ?? state.mode;
    // persist chosen mode as an operator preference (lightweight)
    mode = useMode;

    let evt: OEvent = event;

    if (isStreakErrorEvent(event)) {
      const within = now - errWindowStartedAt <= 18_000;
      if (!within) {
        errWindowStartedAt = now;
        errStreak = 0;
      }
      errStreak += 1;
      if (errStreak >= 3) {
        evt = "repeated_error_threshold";
      }
    } else {
      errStreak = 0;
      errWindowStartedAt = 0;
    }

    rawO = applyDelta(base, evt);
    saveO(rawO);

    lastEvent = evt;
    const eff = effectiveO(floor);
    copy = shouldOverrideCopy(evt) ? pickCopy(evt, eff, useMode) : null;
    commit();
  },
  setO(o: OScore): void {
    rawO = clampScore(o);
    saveO(rawO);
    copy = null;
    lastEvent = null;
    commit();
  },
  reset(): void {
    errStreak = 0;
    errWindowStartedAt = 0;
    rawO = 0;
    saveO(rawO);
    mode = "plain";
    copy = null;
    lastEvent = null;
    commit();
  },
};

export function useONote(): { state: ONState; api: typeof oNoteStore } {
  const s = useSyncExternalStore(oNoteStore.subscribe, oNoteStore.get, oNoteStore.get);
  return useMemo(() => ({ state: s, api: oNoteStore }), [s]);
}
