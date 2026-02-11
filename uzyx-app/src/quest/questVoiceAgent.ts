import { useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { getUzyxTimeDigit, uzyxFooterAPI } from "@/uzyx";
import { speakVoice, stopVoice } from "@/uzyx/core/voice";

type QuestPhase = "IDLE" | "RUNNING" | "ENDED";

export type QuestVoiceContext = {
  phase: QuestPhase;
  step: number; // 0..5
  fails: number; // consecutive failures within current step
  hint: string; // short on-screen hint (≤ 24 chars)
  status: string; // short status line
};

type HoldHandlers = {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
};

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function pick<T>(arr: readonly T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length]!;
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return false;
  return Boolean(t.closest("input,textarea,select,[contenteditable='true']"));
}

function voiceLine(ctx: QuestVoiceContext, timeDigit: number): string | null {
  const step = Math.max(0, Math.floor(ctx.step || 0));
  const fails = clamp(Math.floor(ctx.fails || 0), 0, 9);

  const soft = [
    "…",
    "ça tient.",
    "encore.",
    "un pli calme.",
    "bord stable.",
    "grain. puis silence.",
  ] as const;

  if (ctx.phase === "ENDED") {
    const ended = [
      "scellé.",
      "un retour. sans preuve.",
      "calme. ça reste.",
      "plus loin. pas plus vite.",
    ] as const;
    return pick(ended, timeDigit);
  }

  if (ctx.phase === "IDLE") {
    const idle = [
      "Δ attend.",
      "un départ, posé.",
      "pas de bruit.",
      "un geste. puis rien.",
    ] as const;
    return pick(idle, timeDigit);
  }

  if (fails >= 3) {
    const hard = [
      "trop serré. relâcher.",
      "moins. plus net.",
      "reprendre plus court.",
      "aucune preuve. juste un pli.",
    ] as const;
    return pick(hard, timeDigit);
  }

  if (fails >= 1) {
    const mid = [
      "presque.",
      "moins.",
      "un seul fragment.",
      "laisser du vide.",
    ] as const;
    return pick(mid, timeDigit);
  }

  if (step === 1) {
    const s1 = [
      "un fragment. pas long.",
      "matière. sans décor.",
      "un bord. une phrase.",
      "tenir net. puis s'arrêter.",
    ] as const;
    return pick(s1, timeDigit);
  }
  if (step === 2) {
    const s2 = [
      "neuf mots. ou moins.",
      "≤ neuf mots. rien de plus.",
      "court. stable.",
      "un pli. neuf mots.",
    ] as const;
    return pick(s2, timeDigit);
  }
  if (step === 3) {
    const s3 = [
      "passage. trois lettres.",
      "c. d. o.",
      "un passage. sans récit.",
      "trois bords. un choix.",
    ] as const;
    return pick(s3, timeDigit);
  }
  if (step === 4) {
    const s4 = [
      "un glyphe. α..ω.",
      "une lettre. rien d'autre.",
      "glyph: simple.",
      "un signe. sans image.",
    ] as const;
    return pick(s4, timeDigit);
  }
  if (step === 5) {
    const s5 = [
      "seed. ligne O.",
      "O. puis un fil.",
      "court. public. stable.",
      "un nom. pas un secret.",
    ] as const;
    return pick(s5, timeDigit);
  }

  return pick(soft, timeDigit);
}

export function useQuestVoiceAgent(ctx: QuestVoiceContext): {
  activate: () => boolean;
  holdHandlers: HoldHandlers;
} {
  const ctxRef = useRef<QuestVoiceContext>(ctx);
  ctxRef.current = ctx;

  const lastSpokeAtRef = useRef<number>(0);
  const holdRef = useRef<{
    t0: number;
    x0: number;
    y0: number;
    moved: boolean;
    pid: number;
  } | null>(null);

  const activateRef = useRef<() => boolean>(() => false);
  activateRef.current = () => {
    const uzyx = uzyxFooterAPI.getUzyxState();
    if (!uzyx.consentOk || !uzyx.charteOk) return false;
    if (uzyx.locked || uzyx.failSafe) {
      stopVoice();
      return false;
    }

    const now = Date.now();
    if (now - lastSpokeAtRef.current < 900) return false;
    lastSpokeAtRef.current = now;

    const timeDigit = getUzyxTimeDigit();
    const text = voiceLine(ctxRef.current, timeDigit);
    if (!text) return false;

    return speakVoice({ text, note: timeDigit, towardO: Boolean(uzyx.towardO) });
  };

  // Activation: Alt+V (keyboard), no visible UI.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (!e.altKey) return;
      const k = String(e.key || "");
      if (k !== "v" && k !== "V") return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      activateRef.current();
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const holdHandlers: HoldHandlers = {
    onPointerDown: (e) => {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      holdRef.current = {
        t0: Date.now(),
        x0: e.clientX,
        y0: e.clientY,
        moved: false,
        pid: e.pointerId,
      };
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}
    },
    onPointerMove: (e) => {
      const h = holdRef.current;
      if (!h) return;
      if (e.pointerId !== h.pid) return;
      const dx = e.clientX - h.x0;
      const dy = e.clientY - h.y0;
      if (dx * dx + dy * dy > 18 * 18) h.moved = true;
    },
    onPointerUp: (e) => {
      const h = holdRef.current;
      holdRef.current = null;
      if (!h) return;
      if (e.pointerId !== h.pid) return;
      if (h.moved) return;
      const held = Date.now() - h.t0;
      if (held < 520) return;
      activateRef.current();
    },
    onPointerCancel: () => {
      holdRef.current = null;
    },
  };

  return { activate: () => activateRef.current(), holdHandlers };
}
