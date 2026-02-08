import React, { useEffect, useRef, useState } from "react";
import "./hautPoint.css";
import { isInverted } from "@/theme/invert";

type Props = {
  href?: string;
  label?: string;
};

export function HautPoint(props: Props) {
  const href = props.href ?? "#/HAUT";
  const label = props.label ?? "Haut Point";

  const [inverted, setInverted] = useState<boolean>(() => isInverted());
  const [glitching, setGlitching] = useState(false);

  const invertedRef = useRef<boolean>(inverted);
  useEffect(() => {
    invertedRef.current = inverted;
  }, [inverted]);

  const lastActivityRef = useRef<number>(Date.now());

  // Observe [data-invert] without coupling to a router.
  useEffect(() => {
    const root = document.documentElement;
    const obs = new MutationObserver(() => setInverted(isInverted()));
    obs.observe(root, { attributes: true, attributeFilter: ["data-invert"] });
    return () => obs.disconnect();
  }, []);

  // Rare micro-glitch reveal while idle.
  useEffect(() => {
    const idleMs = 9000;
    const everyMs = 24000;
    let tickTimer: number | null = null;
    let offTimer: number | null = null;

    const onActivity = () => {
      lastActivityRef.current = Date.now();
      setGlitching(false);
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

    const tick = () => {
      const idleFor = Date.now() - lastActivityRef.current;
      if (!invertedRef.current && idleFor >= idleMs) {
        setGlitching(true);
        if (offTimer !== null) window.clearTimeout(offTimer);
        offTimer = window.setTimeout(() => setGlitching(false), 70);
      }
      tickTimer = window.setTimeout(tick, everyMs);
    };

    // Start later (no immediate reveal).
    tickTimer = window.setTimeout(tick, everyMs);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity as any));
      if (tickTimer !== null) window.clearTimeout(tickTimer);
      if (offTimer !== null) window.clearTimeout(offTimer);
    };
  }, []);

  const revealed = inverted || glitching;

  return (
    <a
      className={`hautPoint ${revealed ? "is-revealed" : ""} ${glitching ? "is-glitch" : ""}`}
      href={href}
      aria-label={label}
      tabIndex={inverted ? 0 : -1}
      data-revealed={revealed ? "1" : "0"}
      data-glitching={glitching ? "1" : "0"}
    >
      <span className="hautPointLabel" aria-hidden="true">
        HAUT
      </span>
      <span className="hautPointDot" aria-hidden="true" />
    </a>
  );
}
