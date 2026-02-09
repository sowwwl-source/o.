import type { LandTheme } from "@/api/apiClient";

function clamp(n: number, a: number, b: number): number {
  if (!Number.isFinite(n)) return a;
  return Math.max(a, Math.min(b, n));
}

function hsl(h: number, s: number, l: number): string {
  const hh = Math.round(clamp(h, 0, 359));
  const ss = Math.round(clamp(s, 0, 100));
  const ll = Math.round(clamp(l, 0, 100));
  return `hsl(${hh} ${ss}% ${ll}%)`;
}

export function bicolorFromLandTheme(theme: LandTheme): { t1: string; t2: string } {
  const hue = clamp(theme.hue, 0, 359);
  const sat = clamp(theme.sat, 0, 100);
  const lum = clamp(theme.lum, 0, 100);
  const contrast = clamp(theme.contrast, 0.8, 1.8);

  const light = hsl(hue, sat, lum);

  const baseDark = 100 - lum;
  const darkLum = clamp(Math.round(10 + baseDark * 0.68 + (contrast - 1) * 7), 7, 28);
  const darkSat = clamp(Math.round(sat * 0.52), 0, 42);
  const dark = hsl(hue, darkSat, darkLum);

  return { t1: dark, t2: light };
}

export function clearLandTheme(): void {
  const root = document.documentElement;
  root.style.removeProperty("--t1");
  root.style.removeProperty("--t2");
  root.style.removeProperty("--land-contrast");
  delete root.dataset.landGlyph;
  delete root.dataset.landInvertOnClick;
}

export function applyLandTheme(theme: LandTheme | null | undefined): void {
  if (!theme || !theme.glyph) {
    clearLandTheme();
    return;
  }
  const root = document.documentElement;
  const { t1, t2 } = bicolorFromLandTheme(theme);
  root.style.setProperty("--t1", t1);
  root.style.setProperty("--t2", t2);
  root.style.setProperty("--land-contrast", String(clamp(theme.contrast, 0.8, 1.8)));
  root.dataset.landGlyph = String(theme.glyph || "");
  root.dataset.landInvertOnClick = theme.invertOnClick ? "true" : "false";
}

