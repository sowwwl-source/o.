import { useEffect, useRef, useState } from "react";

export type PreviewNavPhase = "idle" | "preview";

export type PreviewNavState = {
  phase: PreviewNavPhase;
  targetId: string | null;
};

export function usePreviewNav(opts: {
  durationMs?: number;
  getReducedMotion?: () => boolean;
  navigate: (href: string) => void;
}) {
  const durationMs = Math.max(0, Math.floor(opts.durationMs ?? 760));
  const [state, setState] = useState<PreviewNavState>({ phase: "idle", targetId: null });

  const timerRef = useRef<number | null>(null);
  const hrefRef = useRef<string | null>(null);
  const reducedRef = useRef<() => boolean>(() => false);

  reducedRef.current = opts.getReducedMotion ?? (() => false);

  const cancel = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    hrefRef.current = null;
    setState({ phase: "idle", targetId: null });
  };

  const begin = (targetId: string, href: string) => {
    if (state.phase !== "idle") return false;
    const reduced = reducedRef.current();
    if (reduced || durationMs <= 0) {
      opts.navigate(href);
      return true;
    }

    hrefRef.current = href;
    setState({ phase: "preview", targetId });

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const h = hrefRef.current;
      hrefRef.current = null;
      setState({ phase: "idle", targetId: null });
      if (h) opts.navigate(h);
    }, durationMs);

    return true;
  };

  useEffect(() => cancel, []);

  return {
    state,
    begin,
    cancel,
    busy: state.phase !== "idle",
  };
}

