import { useEffect, useMemo, useRef, useState } from "react";

export type PreviewPhase = "idle" | "animating";

export type PreviewNavState = {
  phase: PreviewPhase;
  activeId: string | null;
};

type PreviewOptions = {
  durationMs?: number;
  onNavigate?: (href: string) => void;
};

export function usePreviewNavigation(opts?: PreviewOptions) {
  const durationMs = opts?.durationMs ?? 780;
  const onNavigate =
    opts?.onNavigate ??
    ((href: string) => {
      window.location.href = href;
    });

  const [state, setState] = useState<PreviewNavState>({
    phase: "idle",
    activeId: null,
  });

  const timerRef = useRef<number | null>(null);

  const prefersReducedMotion = useMemo(() => {
    return (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const start = (id: string, href: string) => {
    if (state.phase === "animating") return;
    if (prefersReducedMotion) {
      onNavigate(href);
      return;
    }

    setState({ phase: "animating", activeId: id });

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      onNavigate(href);
    }, durationMs);
  };

  const cancel = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setState({ phase: "idle", activeId: null });
  };

  return { state, start, cancel, durationMs };
}
