import { useEffect, useRef, useState } from "react";

type RevealOptions = {
  idleMs?: number;
  glitchEveryMs?: number;
};

export function useHautPointReveal(opts?: RevealOptions) {
  const idleMs = opts?.idleMs ?? 8000;
  const glitchEveryMs = opts?.glitchEveryMs ?? 20000;

  const [isInverted, setIsInverted] = useState<boolean>(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("is-inverted");
  });
  const [glitching, setGlitching] = useState(false);

  const lastActivityRef = useRef<number>(Date.now());
  const idleTimerRef = useRef<number | null>(null);
  const glitchTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const observer = new MutationObserver(() => {
      const next = document.documentElement.classList.contains("is-inverted");
      setIsInverted(next);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const clearTimers = () => {
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      if (glitchTimerRef.current !== null) {
        window.clearTimeout(glitchTimerRef.current);
        glitchTimerRef.current = null;
      }
    };

    const scheduleGlitch = () => {
      glitchTimerRef.current = window.setTimeout(() => {
        const now = Date.now();
        const idleFor = now - lastActivityRef.current;
        if (idleFor >= idleMs) {
          setGlitching(true);
          window.setTimeout(() => setGlitching(false), 60);
        }
        scheduleGlitch();
      }, glitchEveryMs);
    };

    const onActivity = () => {
      lastActivityRef.current = Date.now();
      if (glitching) setGlitching(false);
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = window.setTimeout(() => {
        // idle reached; allow next scheduled glitch to reveal
      }, idleMs);
    };

    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "click",
      "keydown",
      "wheel",
      "scroll",
      "touchstart",
    ];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true } as any));
    window.addEventListener("input", onActivity as any, { passive: true } as any);
    window.addEventListener("change", onActivity as any, { passive: true } as any);

    onActivity();
    scheduleGlitch();

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity as any));
      window.removeEventListener("input", onActivity as any);
      window.removeEventListener("change", onActivity as any);
      clearTimers();
    };
  }, [idleMs, glitchEveryMs, glitching]);

  const revealed = isInverted || glitching;
  return { revealed, glitching };
}
