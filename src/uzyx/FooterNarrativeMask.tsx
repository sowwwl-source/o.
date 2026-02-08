// src/uzyx/FooterNarrativeMask.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./footerWave.css";

import { createIdle11s } from "./idle11";
import { genHaiku } from "./haiku";
import { speakVoice, stopVoice, isSpeaking } from "./voice";
import { startUzyxTime, subscribeUzyxTime, getUzyxTimeDigit } from "./uzyxTime";
import {
  intensityFromLetter,
  noteFromLetter,
  distanceToO,
  mirrorAroundO,
  letterToIndex,
  indexToLetter,
  clamp,
} from "./uzyxMath";
import {
  loadFailSafe,
  saveFailSafe,
  applyFailSafeBase,
  installFailSafeRandomClick,
  forceNormalPalette,
} from "./failSafe";
import { randomPalette } from "./palettes";

/**
 * Uzyx Footer API (internal)
 * - setUzyxState: hook state from server/client logic (letter, towardO, flags, consent, etc.)
 * - failSafe: enable black-on-black + random palettes on click
 *
 * You can import { uzyxFooterAPI } from "./index" elsewhere.
 */

export type UzyxFlags = {
  locked?: boolean;
  failSafe?: boolean;
  charteOk?: boolean;
  consentOk?: boolean;
};

export type UzyxState = {
  // Core:
  letter: string; // A..Z (internal mask)
  towardO: boolean; // trajectory toward O => richer prosody
  // Gates:
  consentOk: boolean; // hard gate
  charteOk: boolean; // hard gate for AZA
  locked: boolean; // hard block voice
  failSafe: boolean; // fail safe mode
  // Optional: influence on visibility of the invocation link
  unstable?: boolean;
};

export type FooterAPI = {
  setUzyxState: (partial: Partial<UzyxState>) => void;
  getUzyxState: () => UzyxState;
  enableFailSafe: (enabled: boolean) => void;
};

const DEFAULT_STATE: UzyxState = {
  letter: "C",
  towardO: false,
  consentOk: true,
  charteOk: true,
  locked: false,
  failSafe: false,
  unstable: false,
};

export const uzyxFooterAPI: FooterAPI = (() => {
  let current = { ...DEFAULT_STATE };
  const listeners = new Set<(s: UzyxState) => void>();

  const emit = () => listeners.forEach((fn) => fn(current));

  return {
    setUzyxState(partial) {
      current = { ...current, ...partial };
      emit();
    },
    getUzyxState() {
      return current;
    },
    enableFailSafe(enabled: boolean) {
      current = { ...current, failSafe: enabled };
      emit();
    },
    // internal subscribe
    __subscribe(fn: (s: UzyxState) => void) {
      listeners.add(fn);
      fn(current);
      return () => listeners.delete(fn);
    },
  } as FooterAPI & { __subscribe: (fn: (s: UzyxState) => void) => () => void };
})();

function useUzyxFooterState(): [UzyxState, (p: Partial<UzyxState>) => void] {
  const [s, setS] = useState<UzyxState>(() => uzyxFooterAPI.getUzyxState());
  useEffect(() => {
    const unsub = (uzyxFooterAPI as any).__subscribe((x: UzyxState) => setS(x));
    return unsub;
  }, []);
  const setPartial = (p: Partial<UzyxState>) => uzyxFooterAPI.setUzyxState(p);
  return [s, setPartial];
}

/**
 * AZA speaks ONLY when:
 * - consentOk && charteOk
 * - not locked
 * - not failSafe
 * - user idle 11s on same page and document visible
 * - cooldown satisfied (non constant, modulated by uzyx_time)
 */
function computeCooldownMs(timeDigit: number): number {
  // 9..38 seconds (non-constant, slow)
  return 9000 + timeDigit * 3200;
}

/**
 * Optional: local "instability" to create sudden flips near O.
 * This is NOT the main scoring system; it's a local wave/voice modulator.
 */
function computeInstabilityProb(letter: string, timeDigit: number): number {
  const d = distanceToO(letter); // 0..?
  const K = 0.35;
  const base = clamp(K / (d + 1), 0, 1);
  const noise = 0.6 + timeDigit / 15; // 0.6..1.2
  return clamp(base * noise, 0, 1);
}

function maybeFlipLetter(letter: string, timeDigit: number): string {
  const p = computeInstabilityProb(letter, timeDigit);
  if (Math.random() < p * 0.15) {
    // rare flip event
    // 50% mirror, 50% neighbor
    if (Math.random() < 0.5) return mirrorAroundO(letter);
    const idx = letterToIndex(letter);
    const step = Math.random() < 0.5 ? -1 : 1;
    return indexToLetter(idx + step);
  }
  return letter;
}

export function FooterNarrativeMask(props: {
  /** Link target for the dedicated .O. interface */
  joinUrl?: string; // e.g. "https://sowwwl.cloud/o"
  /** If you want to pass a nonce without exposing state */
  nonceProvider?: () => string; // returns short nonce
}) {
  const [uzyx, setUzyx] = useUzyxFooterState();

  // uzyx_time digit (0..9)
  const [timeDigit, setTimeDigit] = useState<number>(() => getUzyxTimeDigit());

  // local computed letter (can be gently destabilized)
  const [letter, setLetter] = useState<string>(() => uzyx.letter);

  // cooldown
  const lastSpokeAtRef = useRef<number>(0);

  // fail safe uninstall handler
  const failSafeUninstallRef = useRef<null | (() => void)>(null);

  // start time engine once
  useEffect(() => {
    const stopTimer = startUzyxTime();
    const unsub = subscribeUzyxTime((d) => setTimeDigit(d));
    return () => {
      unsub();
      stopTimer();
    };
  }, []);

  // sync letter input, then allow rare flips
  useEffect(() => {
    setLetter(uzyx.letter);
  }, [uzyx.letter]);

  useEffect(() => {
    // occasional sudden flip near O (less frequent as distance grows)
    setLetter((prev) => maybeFlipLetter(prev, timeDigit));
  }, [timeDigit]);

  // Apply palette baseline (non failsafe)
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!uzyx.failSafe) {
      // subtle controlled palette drift tied to timeDigit (optional)
      const p = randomPalette(timeDigit + 17);
      document.documentElement.style.setProperty("--uzyx-bg", p.bg);
      document.documentElement.style.setProperty("--uzyx-fg", p.fg);
      document.documentElement.style.setProperty("--uzyx-accent", p.accent ?? p.fg);
    }
  }, [timeDigit, uzyx.failSafe]);

  // FailSafe persistence (optional)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fs = loadFailSafe();
    if (fs.enabled) uzyxFooterAPI.enableFailSafe(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (uzyx.failSafe) {
      // stop voice, black-on-black, random palettes on click
      stopVoice();
      applyFailSafeBase();
      if (!failSafeUninstallRef.current) {
        failSafeUninstallRef.current = installFailSafeRandomClick();
      }
      saveFailSafe({ enabled: true });
    } else {
      // restore normal palette behavior
      if (failSafeUninstallRef.current) {
        failSafeUninstallRef.current();
        failSafeUninstallRef.current = null;
      }
      forceNormalPalette();
      saveFailSafe({ enabled: false });
    }
  }, [uzyx.failSafe]);

  // Idle 11 seconds logic (AZA speak trigger)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const cleanup = createIdle11s({
      onIdle: () => {
        // Hard gates
        if (!uzyx.consentOk || !uzyx.charteOk) return;
        if (uzyx.locked || uzyx.failSafe) return;

        const now = Date.now();
        const cd = computeCooldownMs(timeDigit);
        if (now - lastSpokeAtRef.current < cd) return;

        // Speak haiku-ish fragment
        const note = noteFromLetter(letter);
        const text = genHaiku(timeDigit, uzyx.towardO);
        const ok = speakVoice({ text, note, towardO: uzyx.towardO });
        if (ok) lastSpokeAtRef.current = now;
      },
      onActive: () => {
        // Any activity stops voice immediately
        if (isSpeaking()) stopVoice();
      },
    });

    return cleanup;
    // Intentionally depend on current gates and modulation
  }, [
    uzyx.consentOk,
    uzyx.charteOk,
    uzyx.locked,
    uzyx.failSafe,
    uzyx.towardO,
    timeDigit,
    letter,
  ]);

  // Wave parameters
  const intensity = useMemo(() => intensityFromLetter(letter), [letter]);

  // Invocation link visibility trick:
  // - Near instability or certain states, the link can be "present but invisible".
  const invokeInvisible = useMemo(() => {
    if (uzyx.failSafe) return true;
    // when unstable OR near O zones, link can disappear into background sometimes
    const d = distanceToO(letter);
    const near = d <= 2; // around N/O/P zone
    const flicker = (timeDigit + d) % 5 === 0;
    return !!uzyx.unstable || (near && flicker);
  }, [uzyx.failSafe, uzyx.unstable, letter, timeDigit]);

  // Join URL without leaking state
  const joinUrl = useMemo(() => {
    const base = props.joinUrl ?? "https://sowwwl.cloud/o";
    const nonce = props.nonceProvider?.();
    if (!nonce) return base;
    const url = new URL(base);
    url.searchParams.set("o", nonce);
    return url.toString();
  }, [props.joinUrl, props.nonceProvider]);

  return (
    <>
      {/* Footer wave: pointer-events none, purely "page speaks" */}
      <div className="uzyxFooter" aria-hidden="true">
        <WaveSVG intensity={intensity} timeDigit={timeDigit} />
      </div>

      {/* Invocation link: "Rejoins moi la .O." */}
      <a
        className={`uzyxInvoke ${invokeInvisible ? "invisible" : ""}`}
        href={joinUrl}
        rel="noreferrer"
      >
        Rejoins moi la .O.
      </a>

      {/* Optional: dev hotkeys for testing (remove in prod) */}
      <DevHotkeys state={uzyx} setState={setUzyx} />
    </>
  );
}

/**
 * Wave SVG: simple, non-periodic feel using timeDigit + intensity.
 * No heavy canvas; keep it minimal and stable.
 */
function WaveSVG(props: { intensity: number; timeDigit: number }) {
  const { intensity, timeDigit } = props;

  // amplitude and "phase drift"
  const amp = 2 + intensity * 18; // 2..20
  const drift = (timeDigit / 9) * 0.9 + 0.1; // 0.1..1.0

  // build path with a few control points; slight variations by timeDigit
  const w = 1000;
  const h = 64;
  const y0 = 44;

  const k1 = 0.9 + (timeDigit % 3) * 0.2;
  const k2 = 0.7 + ((timeDigit + 1) % 4) * 0.15;

  const yA = y0 + Math.sin((timeDigit + 1) * 0.7) * amp * 0.25;
  const yB = y0 + Math.cos((timeDigit + 2) * 0.6) * amp * 0.35;
  const yC = y0 + Math.sin((timeDigit + 3) * 0.8) * amp * 0.30;

  const x1 = w * 0.25;
  const x2 = w * 0.5;
  const x3 = w * 0.75;

  const path = `M 0 ${y0}
    C ${x1 * k1} ${yA} ${x2 * k2} ${yB} ${x2} ${yB}
    S ${x3} ${yC} ${w} ${y0}
    L ${w} ${h} L 0 ${h} Z`;

  // subtle animation using CSS-less SMIL-like? Keep it simple: animate opacity via inline style.
  const opacity = 0.18 + drift * 0.22; // 0.20..0.40

  return (
    <svg className="uzyxWave" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={path} fill="var(--uzyx-fg)" opacity={opacity} />
      <path
        d={path}
        fill="none"
        stroke="var(--uzyx-accent)"
        strokeWidth={1}
        opacity={0.12 + drift * 0.12}
      />
    </svg>
  );
}

/**
 * DevHotkeys: optional test helpers. Remove in production.
 * - Toggle failSafe: Shift+F
 * - Toggle locked: Shift+L
 * - Toggle towardO: Shift+O
 * - Move letter +/-: Shift+ArrowLeft/Right
 */
function DevHotkeys(props: { state: UzyxState; setState: (p: Partial<UzyxState>) => void }) {
  const { state, setState } = props;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.shiftKey) return;

      if (e.code === "KeyF") {
        setState({ failSafe: !state.failSafe });
      }
      if (e.code === "KeyL") {
        setState({ locked: !state.locked });
      }
      if (e.code === "KeyO") {
        setState({ towardO: !state.towardO });
      }
      if (e.code === "ArrowLeft") {
        const idx = letterToIndex(state.letter) - 1;
        setState({ letter: indexToLetter(idx) });
      }
      if (e.code === "ArrowRight") {
        const idx = letterToIndex(state.letter) + 1;
        setState({ letter: indexToLetter(idx) });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, setState]);

  return null;
}
