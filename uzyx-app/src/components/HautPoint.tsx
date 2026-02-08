import React, { useEffect, useRef, useState } from "react";
import "./hautPoint.css";
import { isInverted } from "@/theme/invert";

type Props = {
  href?: string;
  label?: string;
  onHoldStill?: () => void;
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

  const holdRef = useRef<{
    t: number | null;
    pointerId: number | null;
    fired: boolean;
    startX: number;
    startY: number;
  }>({ t: null, pointerId: null, fired: false, startX: 0, startY: 0 });

  const cancelHold = (opts?: { resetFired?: boolean }) => {
    if (holdRef.current.t !== null) window.clearTimeout(holdRef.current.t);
    holdRef.current.t = null;
    holdRef.current.pointerId = null;
    if (opts?.resetFired) holdRef.current.fired = false;
  };

  useEffect(() => {
    return () => cancelHold({ resetFired: true });
  }, []);

  const startHold = () => {
    if (!props.onHoldStill) return;
    if (holdRef.current.t !== null) window.clearTimeout(holdRef.current.t);
    holdRef.current.fired = false;
    const holdMs = 720;
    holdRef.current.t = window.setTimeout(() => {
      holdRef.current.t = null;
      holdRef.current.fired = true;
      props.onHoldStill?.();
    }, holdMs);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLAnchorElement>) => {
    if (!props.onHoldStill) return;
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    holdRef.current.pointerId = e.pointerId;
    holdRef.current.startX = e.clientX;
    holdRef.current.startY = e.clientY;
    startHold();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLAnchorElement>) => {
    if (!props.onHoldStill) return;
    if (holdRef.current.t === null) return;
    if (holdRef.current.pointerId !== e.pointerId) return;
    const dx = e.clientX - holdRef.current.startX;
    const dy = e.clientY - holdRef.current.startY;
    if (Math.hypot(dx, dy) > 10) cancelHold({ resetFired: true });
  };

  const onPointerUp = () => cancelHold();
  const onPointerCancel = () => cancelHold({ resetFired: true });

  const onKeyDown = (e: React.KeyboardEvent<HTMLAnchorElement>) => {
    if (!props.onHoldStill) return;
    if (e.defaultPrevented) return;
    if (e.repeat) return;
    const k = String(e.key || "");
    if (k !== " " && k !== "Enter") return;
    startHold();
  };

  const onKeyUp = (e: React.KeyboardEvent<HTMLAnchorElement>) => {
    if (!props.onHoldStill) return;
    const k = String(e.key || "");
    if (k !== " " && k !== "Enter") return;
    cancelHold({ resetFired: true });
  };

  const onBlur = () => cancelHold({ resetFired: true });

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!props.onHoldStill) return;
    if (holdRef.current.fired) {
      e.preventDefault();
      e.stopPropagation();
      holdRef.current.fired = false;
    }
  };

  return (
    <a
      className={`hautPoint ${revealed ? "is-revealed" : ""} ${glitching ? "is-glitch" : ""}`}
      href={href}
      aria-label={label}
      tabIndex={inverted ? 0 : -1}
      data-revealed={revealed ? "1" : "0"}
      data-glitching={glitching ? "1" : "0"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={onBlur}
      onClick={onClick}
    >
      <span className="hautPointLabel" aria-hidden="true">
        HAUT
      </span>
      <span className="hautPointDot" aria-hidden="true" />
    </a>
  );
}
