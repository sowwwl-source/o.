import { useEffect, useRef } from "react";
import { uzyxFooterAPI } from "@/uzyx";
import { useUzyxState } from "./useUzyxState";

type ActionKind = "tap" | "key" | "wheel" | "scroll" | "touch" | "focus" | "blur" | "invert" | "hash";
type ActionSample = { t: number; dt?: number; kind: ActionKind; nonInteractive?: boolean; onInvoke?: boolean };

const KEEP_MS = 12_000;
const CLICK_6S = 12;
const ACTION_10S = 25;
const RELEASE_SILENCE_MS = 180_000;

function isInteractiveTarget(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return false;
  if (t.closest("a,input,textarea,select,summary,[contenteditable='true'],[role='link']")) return true;
  const tab = t.closest("[tabindex]");
  if (!tab) return false;
  const v = tab.getAttribute("tabindex");
  return v !== null && v !== "-1";
}

function meanAndStd(dts: number[]): { mean: number; std: number } {
  if (!dts.length) return { mean: 0, std: Infinity };
  const mean = dts.reduce((a, b) => a + b, 0) / dts.length;
  const variance = dts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / dts.length;
  return { mean, std: Math.sqrt(variance) };
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return false;
  if (t.closest("textarea,[contenteditable='true']")) return true;
  const input = t.closest("input");
  if (!input) return false;
  const type = (input.getAttribute("type") || "text").toLowerCase();
  return type !== "button" && type !== "submit" && type !== "reset" && type !== "checkbox" && type !== "radio";
}

export function useUzyxFailSafe() {
  const uzyx = useUzyxState();

  const samplesRef = useRef<ActionSample[]>([]);
  const lastActionRef = useRef<number>(0);
  const idleTimerRef = useRef<number | null>(null);

  const armIdleRelease = () => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      const s = uzyxFooterAPI.getUzyxState();
      const now = Date.now();
      const last = lastActionRef.current || now;
      if (!s.failSafe) return;
      if (now - last < RELEASE_SILENCE_MS) return;
      uzyxFooterAPI.setUzyxState({ failSafe: false, unstable: false });
    }, RELEASE_SILENCE_MS);
  };

  const record = (kind: ActionKind, e?: Event, meta?: { nonInteractive?: boolean; onInvoke?: boolean }) => {
    const now = Date.now();
    const last = lastActionRef.current || now;
    const dt = now - last;
    lastActionRef.current = now;

    const arr = samplesRef.current;
    arr.push({ t: now, dt, kind, nonInteractive: meta?.nonInteractive, onInvoke: meta?.onInvoke });
    const cutoff = now - KEEP_MS;
    while (arr.length && arr[0]!.t < cutoff) arr.shift();

    armIdleRelease();

    const s = uzyxFooterAPI.getUzyxState();
    if (s.failSafe) return;

    const clicks6s = arr.filter((x) => x.kind === "tap" && x.t >= now - 6_000).length;
    const actions10s = arr.filter((x) => x.t >= now - 10_000 && x.kind !== "blur" && x.kind !== "focus").length;

    const nonInteractive6s = arr.filter((x) => x.kind === "tap" && x.nonInteractive && x.t >= now - 6_000).length;
    const invoke10s = arr.filter((x) => x.onInvoke && x.t >= now - 10_000).length;

    const blurFocus10s = arr.filter((x) => (x.kind === "blur" || x.kind === "focus") && x.t >= now - 10_000).length;
    const invert10s = arr.filter((x) => x.kind === "invert" && x.t >= now - 10_000).length;

    const dts = arr
      .map((x) => x.dt)
      .filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x > 0 && x < 4_000);
    const { mean, std } = meanAndStd(dts);

    const frenzy = clicks6s >= CLICK_6S || actions10s >= ACTION_10S;
    const testEverything = nonInteractive6s >= 10 || invoke10s >= 7;
    const botLike = dts.length >= 10 && mean < 600 && std < 80;
    const explainMode = blurFocus10s >= 8 || (invert10s >= 5 && actions10s >= 12);

    const untrusted = Boolean(e && "isTrusted" in e && (e as any).isTrusted === false);
    if (untrusted || frenzy || testEverything || botLike || explainMode) {
      uzyxFooterAPI.setUzyxState({ failSafe: true, locked: false });
    }
  };

  useEffect(() => {
    const lastWheelAt = { v: 0 };
    const lastScrollAt = { v: 0 };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target;
      const nonInteractive = !isInteractiveTarget(target);
      const onInvoke = target instanceof Element ? Boolean(target.closest(".uzyxInvoke")) : false;
      record("tap", e, { nonInteractive, onInvoke });
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      record("key", e);
    };
    const onWheel = (e: WheelEvent) => {
      const now = Date.now();
      if (now - lastWheelAt.v < 520) return;
      lastWheelAt.v = now;
      record("wheel", e);
    };
    const onScroll = (e: Event) => {
      const now = Date.now();
      if (now - lastScrollAt.v < 520) return;
      lastScrollAt.v = now;
      record("scroll", e);
    };
    const onTouchStart = (e: TouchEvent) => record("touch", e);
    const onFocus = (e: FocusEvent) => record("focus", e);
    const onBlur = (e: FocusEvent) => record("blur", e);
    const onHash = (e: HashChangeEvent) => record("hash", e);

    window.addEventListener("pointerdown", onPointerDown, { passive: true, capture: true });
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("wheel", onWheel, { passive: true, capture: true });
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    window.addEventListener("focus", onFocus, { capture: true });
    window.addEventListener("blur", onBlur, { capture: true });
    window.addEventListener("hashchange", onHash);

    const mo = new MutationObserver((entries) => {
      for (const ent of entries) {
        if (ent.type === "attributes" && ent.attributeName === "data-invert") record("invert");
      }
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-invert"] });

    armIdleRelease();

    return () => {
      mo.disconnect();
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("touchstart", onTouchStart, true);
      window.removeEventListener("focus", onFocus, true);
      window.removeEventListener("blur", onBlur, true);
      window.removeEventListener("hashchange", onHash);
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (uzyx.failSafe) root.dataset.failsafe = "true";
    else delete root.dataset.failsafe;
  }, [uzyx.failSafe]);
}
