import { useEffect } from "react";
import { uzyxFooterAPI } from "@/uzyx";
import { useUzyxState } from "./useUzyxState";

const SILENCE_MS = 11_000;

export function useUzyxFailSafeGuard() {
  const uzyx = useUzyxState();

  // Trip failSafe on forced interaction (scripts) or click frenzy.
  useEffect(() => {
    const WINDOW_MS = 900;
    const THRESHOLD = 14;
    let taps: number[] = [];

    const trip = () => uzyxFooterAPI.setUzyxState({ failSafe: true });

    const onPointerDown = (e: PointerEvent) => {
      if (!e.isTrusted) return trip();
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      taps.push(now);
      while (taps.length && now - taps[0]! > WINDOW_MS) taps.shift();
      if (taps.length >= THRESHOLD) trip();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.isTrusted) trip();
    };

    window.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
    window.addEventListener("keydown", onKeyDown, { capture: true });

    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  // Exit only by silence/time (no explicit UI).
  useEffect(() => {
    if (!uzyx.failSafe) return;

    let lastActivity = Date.now();
    let timer = 0;

    const onActivity = () => {
      lastActivity = Date.now();
    };

    const tick = () => {
      const idleFor = Date.now() - lastActivity;
      if (idleFor >= SILENCE_MS) {
        uzyxFooterAPI.setUzyxState({ failSafe: false });
        return;
      }
      timer = window.setTimeout(tick, 800);
    };

    window.addEventListener("pointerdown", onActivity, { capture: true, passive: true });
    window.addEventListener("pointermove", onActivity, { capture: true, passive: true });
    window.addEventListener("keydown", onActivity, { capture: true });
    window.addEventListener("wheel", onActivity, { capture: true, passive: true });
    window.addEventListener("scroll", onActivity, { capture: true, passive: true });
    window.addEventListener("touchstart", onActivity, { capture: true, passive: true });

    timer = window.setTimeout(tick, 800);

    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("pointerdown", onActivity, true);
      window.removeEventListener("pointermove", onActivity, true);
      window.removeEventListener("keydown", onActivity, true);
      window.removeEventListener("wheel", onActivity, true);
      window.removeEventListener("scroll", onActivity, true);
      window.removeEventListener("touchstart", onActivity, true);
    };
  }, [uzyx.failSafe]);
}

