import React, { useEffect, useMemo, useRef, useState } from "react";
import "./uzyxAssist.css";
import { useUzyxState } from "./useUzyxState";

type Offer = { id: "reshape"; label: string };

const RARE_USED_KEY = "uzyx:rare:used";

export function UzyxImplicitAssist() {
  const uzyx = useUzyxState();
  const towardO = Boolean(uzyx.towardO);

  const btnRef = useRef<HTMLSpanElement | null>(null);
  const [visible, setVisible] = useState(false);

  // Show at most once per user (localStorage key). If ignored: disappears.
  useEffect(() => {
    if (!towardO) return;
    if (uzyx.failSafe) return;

    let used = false;
    try {
      used = Boolean(localStorage.getItem(RARE_USED_KEY));
    } catch {
      used = false;
    }
    if (used) return;

    try {
      localStorage.setItem(RARE_USED_KEY, "1");
    } catch {}

    setVisible(true);

    const dismiss = () => setVisible(false);

    const onAny = (e: Event) => {
      const t = e.target;
      if (btnRef.current && t instanceof Node && btnRef.current.contains(t)) return;
      dismiss();
    };

    // If ignored: disappear on the next action, or after a short time.
    window.addEventListener("pointerdown", onAny, { capture: true, passive: true });
    window.addEventListener("keydown", onAny, { capture: true });
    const t = window.setTimeout(dismiss, 6500);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", onAny, true);
      window.removeEventListener("keydown", onAny, true);
    };
  }, [towardO, uzyx.failSafe]);

  const offer: Offer | null = useMemo(() => {
    if (!towardO) return null;
    if (uzyx.failSafe) return null;
    if (!visible) return null;
    return { id: "reshape", label: "…" };
  }, [towardO, uzyx.failSafe, visible]);

  if (!offer) return null;

  return (
    <span
      ref={btnRef}
      className="uzyxAssist"
      aria-label={offer.id}
      role="link"
      tabIndex={0}
      onClick={() => {
        setVisible(false);
        try {
          window.dispatchEvent(new Event("uzyx:offer:reshape"));
        } catch {}
      }}
      onKeyDown={(e) => {
        if (e.defaultPrevented) return;
        if (e.repeat) return;
        const k = String(e.key || "");
        if (k !== "Enter" && k !== " ") return;
        e.preventDefault();
        setVisible(false);
        try {
          window.dispatchEvent(new Event("uzyx:offer:reshape"));
        } catch {}
      }}
    >
      {offer.label}
    </span>
  );
}
