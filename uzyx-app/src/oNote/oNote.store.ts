import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import type { OEvent, OScore } from "./oNote.types";
import { clampO } from "./oNote.math";
import { initialScoreFromContext, reduce, type ONoteMachineState } from "./oNote.machine";

export type ONoteContextFlags = {
  hasSession: boolean;
  hasLand: boolean;
  isNewDevice?: boolean;
};

export type ONoteStoreState = ONoteMachineState;

type ApiValue = {
  context: ONoteContextFlags;
  setContext: (ctx: Partial<Pick<ONoteContextFlags, "hasSession" | "hasLand">>) => void;
  dispatch: (event: OEvent) => void;
  reset: () => void;
};

const LS_KEY = "sowwwl:oNote";
const LEGACY_LS_KEY = "sowwwl:oNote:v1";
const DEVICE_KEY = "sowwwl:device:v1";

function readJson(key: string): any {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(key: string, value: any): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function getIsNewDevice(): boolean {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return false;
    localStorage.setItem(DEVICE_KEY, `${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}`);
    return true;
  } catch {
    return false;
  }
}

function loadInitialState(ctx: ONoteContextFlags): { state: ONoteStoreState; hydrated: boolean } {
  const parsed = readJson(LS_KEY);
  if (parsed && typeof parsed === "object") {
    const o = clampO(typeof parsed.o_score === "number" ? parsed.o_score : 0);
    const ceRaw = typeof parsed.consecutive_errors === "number" ? parsed.consecutive_errors : 0;
    const consecutive_errors = Math.max(0, Math.floor(ceRaw));
    return { state: { o_score: o, consecutive_errors }, hydrated: true };
  }

  // Legacy migration: {"o": number}
  const legacy = readJson(LEGACY_LS_KEY);
  if (legacy && typeof legacy === "object" && typeof legacy.o === "number") {
    return { state: { o_score: clampO(legacy.o), consecutive_errors: 0 }, hydrated: true };
  }

  return { state: { o_score: initialScoreFromContext(ctx), consecutive_errors: 0 }, hydrated: false };
}

type Action =
  | { type: "dispatch"; event: OEvent }
  | { type: "reset"; score: OScore };

function reducer(state: ONoteStoreState, action: Action): ONoteStoreState {
  if (action.type === "dispatch") return reduce(state, action.event);
  if (action.type === "reset") return { o_score: clampO(action.score), consecutive_errors: 0 };
  return state;
}

const StateCtx = createContext<ONoteStoreState | null>(null);
const ApiCtx = createContext<ApiValue | null>(null);

export function ONoteProvider(props: { children: React.ReactNode }) {
  const initialContextRef = useRef<ONoteContextFlags>({
    hasSession: false,
    hasLand: false,
    isNewDevice: getIsNewDevice(),
  });

  const init = useMemo(() => loadInitialState(initialContextRef.current), []);
  const hydratedFromStorageRef = useRef<boolean>(init.hydrated);
  const allowContextInitRef = useRef<boolean>(!init.hydrated);

  const [state, dispatchReducer] = useReducer(reducer, init.state);

  const contextRef = useRef<ONoteContextFlags>(initialContextRef.current);
  const [contextVersion, bump] = React.useState(0);

  const setContext = useCallback((ctx: Partial<Pick<ONoteContextFlags, "hasSession" | "hasLand">>) => {
    const next = { ...contextRef.current, ...ctx };
    contextRef.current = next;
    bump((x) => x + 1);

    // If we never hydrated from storage (first run), allow context to set a better initial score once.
    if (!hydratedFromStorageRef.current && allowContextInitRef.current && (next.hasSession || next.hasLand)) {
      allowContextInitRef.current = false;
      dispatchReducer({ type: "reset", score: initialScoreFromContext(next) });
    }
  }, []);

  const dispatch = useCallback((event: OEvent) => dispatchReducer({ type: "dispatch", event }), []);

  const reset = useCallback(() => {
    const score = initialScoreFromContext(contextRef.current);
    dispatchReducer({ type: "reset", score });
  }, []);

  useEffect(() => {
    writeJson(LS_KEY, { o_score: state.o_score, consecutive_errors: state.consecutive_errors });
  }, [state.o_score, state.consecutive_errors]);

  const api = useMemo<ApiValue>(
    () => ({ context: contextRef.current, setContext, dispatch, reset }),
    [contextVersion, setContext, dispatch, reset]
  );

  return React.createElement(
    ApiCtx.Provider,
    { value: api },
    React.createElement(StateCtx.Provider, { value: state }, props.children)
  );
}

export function useONoteState(): ONoteStoreState {
  const v = useContext(StateCtx);
  if (!v) throw new Error("useONoteStore must be used within <ONoteProvider>");
  return v;
}

export function useONoteAPI(): ApiValue {
  const v = useContext(ApiCtx);
  if (!v) throw new Error("useONoteStore must be used within <ONoteProvider>");
  return v;
}

export function useONoteStore(): { state: ONoteStoreState; api: ApiValue } {
  const state = useONoteState();
  const api = useONoteAPI();
  return useMemo(() => ({ state, api }), [state, api]);
}
