// Fail Safe: black-on-black, random palette on each click.
// It should feel like "the system is unreadable" not like an error page.

import { PALETTES, randomPalette, type Palette } from "./palettes";

export type FailSafeState = {
  enabled: boolean;
};

const LS_KEY = "uzyx_failsafe_v1";

export function loadFailSafe(): FailSafeState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { enabled: false };
    const obj = JSON.parse(raw);
    return { enabled: !!obj.enabled };
  } catch {
    return { enabled: false };
  }
}

export function saveFailSafe(s: FailSafeState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {}
}

export function applyPaletteToRoot(p: Palette) {
  const root = document.documentElement;
  root.style.setProperty("--uzyx-bg", p.bg);
  root.style.setProperty("--uzyx-fg", p.fg);
  root.style.setProperty("--uzyx-accent", p.accent ?? p.fg);
}

export function applyFailSafeBase() {
  // black on black, unreadable but present
  applyPaletteToRoot({ bg: "#000000", fg: "#000000", accent: "#000000" });
}

export function installFailSafeRandomClick(): () => void {
  // Random palette per click, from defined palettes (still controlled).
  const onClick = () => {
    const seed = Math.floor(Math.random() * 10_000_000);
    const p = randomPalette(seed);
    applyPaletteToRoot(p);
  };
  window.addEventListener("click", onClick, { passive: true });
  return () => window.removeEventListener("click", onClick);
}

export function forceNormalPalette() {
  // pick a neutral default
  applyPaletteToRoot(PALETTES[0]!);
}
