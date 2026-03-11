// Fail Safe: low-stimulation recovery mode with an explicit way back.
// It should feel calmer, not punitive.

import { PALETTES, randomPalette, type Palette } from "./palettes";

export type FailSafeState = {
  enabled: boolean;
  at?: number;
};

const LS_KEY = "uzyx_failsafe_v2";
const FAILSAFE_TTL_MS = 180_000;

function clampByte(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hex2(n: number): string {
  return clampByte(n).toString(16).padStart(2, "0");
}

function parseHexColor(input: string): { r: number; g: number; b: number } | null {
  const s = String(input || "").trim();
  if (!s.startsWith("#")) return null;
  const h = s.slice(1);
  if (h.length === 3) {
    const r = parseInt(h[0]! + h[0]!, 16);
    const g = parseInt(h[1]! + h[1]!, 16);
    const b = parseInt(h[2]! + h[2]!, 16);
    if (![r, g, b].every((x) => Number.isFinite(x))) return null;
    return { r, g, b };
  }
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if (![r, g, b].every((x) => Number.isFinite(x))) return null;
    return { r, g, b };
  }
  return null;
}

function luma(rgb: { r: number; g: number; b: number }): number {
  return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
}

function failSafeAccentFromPalette(p: Palette): string {
  const base = parseHexColor(p.accent ?? p.fg) ?? { r: 255, g: 255, b: 255 };
  const y = luma(base); // 0..255
  // Keep it near-black: 6..26
  const v = 6 + (y / 255) * 20;
  const h = hex2(v);
  return `#${h}${h}${h}`;
}

export function loadFailSafe(): FailSafeState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { enabled: false };
    const obj = JSON.parse(raw);
    const enabled = !!obj.enabled;
    const at = typeof obj.at === "number" ? obj.at : 0;
    if (enabled && at && Date.now() - at > FAILSAFE_TTL_MS) return { enabled: false };
    return { enabled, at: at || undefined };
  } catch {
    return { enabled: false };
  }
}

export function saveFailSafe(s: FailSafeState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ enabled: !!s.enabled, at: Date.now() }));
  } catch {}
}

export function applyPaletteToRoot(p: Palette) {
  const root = document.documentElement;
  root.style.setProperty("--uzyx-bg", p.bg);
  root.style.setProperty("--uzyx-fg", p.fg);
  root.style.setProperty("--uzyx-accent", p.accent ?? p.fg);
}

export function applyFailSafeBase() {
  applyPaletteToRoot({ bg: "#0a0a0a", fg: "#d9ccb7", accent: "#bda88a" });
}

export function installFailSafeRandomClick(): () => void {
  // Keep the surface readable while softening contrast and motion.
  const onClick = () => {
    const seed = Math.floor(Math.random() * 10_000_000);
    const p = randomPalette(seed);
    applyPaletteToRoot({ bg: "#0a0a0a", fg: "#d9ccb7", accent: failSafeAccentFromPalette(p) });
  };
  window.addEventListener("click", onClick, { passive: true });
  return () => window.removeEventListener("click", onClick);
}

export function forceNormalPalette() {
  // pick a neutral default
  applyPaletteToRoot(PALETTES[0]!);
}
