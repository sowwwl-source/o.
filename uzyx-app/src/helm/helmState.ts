import { graph } from "@/graph/graph";

export type HelmState = {
  open: boolean;
  mode: "normal" | "failsafe-soft" | "failsafe-hard";
  selectedPageId: string | null;
  activePageId: string | null;
  previewLevel: 0 | 1 | 2;
};

type Listener = (s: HelmState) => void;

const DEFAULT_STATE: HelmState = {
  open: false,
  mode: "normal",
  selectedPageId: null,
  activePageId: null,
  previewLevel: 2,
};

let state: HelmState = { ...DEFAULT_STATE };
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((fn) => fn(state));
}

function adjacentOf(active: string | null): string[] {
  if (!active) return [];
  const list = (graph as any)[active] as string[] | undefined;
  return Array.isArray(list) ? list : [];
}

function normalizeSelected(next: HelmState): HelmState {
  if (!next.open) return next;
  const adjacent = adjacentOf(next.activePageId);
  if (!adjacent.length) return { ...next, selectedPageId: null };
  if (next.selectedPageId && adjacent.includes(next.selectedPageId)) return next;
  if (next.activePageId && adjacent.includes(next.activePageId)) return { ...next, selectedPageId: next.activePageId };
  return { ...next, selectedPageId: adjacent[0] ?? null };
}

function setState(patch: Partial<HelmState>) {
  state = normalizeSelected({ ...state, ...patch });
  emit();
}

export type HelmAPI = {
  getState: () => HelmState;
  subscribe: (fn: Listener) => () => void;
  toggle: (force?: boolean) => void;
  select: (deltaOrPageId: number | string) => void;
  commit: () => string | null;
  setActive: (activePageId: string | null) => void;
  setMode: (mode: HelmState["mode"]) => void;
  setPreviewLevel: (previewLevel: HelmState["previewLevel"]) => void;
};

export const helmAPI: HelmAPI = {
  getState() {
    return state;
  },
  subscribe(fn) {
    listeners.add(fn);
    fn(state);
    return () => listeners.delete(fn);
  },
  toggle(force) {
    const nextOpen = typeof force === "boolean" ? force : !state.open;
    const nextPreview: HelmState["previewLevel"] = state.mode === "failsafe-hard" ? 0 : state.previewLevel;
    setState({ open: nextOpen, previewLevel: nextPreview });
  },
  select(deltaOrPageId) {
    if (typeof deltaOrPageId === "string") {
      const adjacent = adjacentOf(state.activePageId);
      if (adjacent.length && adjacent.includes(deltaOrPageId)) setState({ selectedPageId: deltaOrPageId });
      return;
    }
    const delta = Number(deltaOrPageId || 0);
    if (!delta || !Number.isFinite(delta)) return;
    const adjacent = adjacentOf(state.activePageId);
    if (!adjacent.length) return;
    const idx0 = Math.max(0, adjacent.indexOf(state.selectedPageId ?? ""));
    const n = adjacent.length;
    const idx = ((idx0 + Math.round(delta)) % n + n) % n;
    setState({ selectedPageId: adjacent[idx] ?? null });
  },
  commit() {
    if (!state.open) return null;
    const id = state.selectedPageId;
    if (!id) return null;
    try {
      window.dispatchEvent(new CustomEvent("o:helm:commit", { detail: { ...state } }));
    } catch {}
    return id;
  },
  setActive(activePageId) {
    setState({ activePageId });
  },
  setMode(mode) {
    const previewLevel: HelmState["previewLevel"] = mode === "failsafe-hard" ? 0 : state.previewLevel || 2;
    setState({ mode, previewLevel });
  },
  setPreviewLevel(previewLevel) {
    setState({ previewLevel });
  },
};

