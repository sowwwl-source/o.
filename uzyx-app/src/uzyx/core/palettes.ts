// Define a few palettes. FailSafe randomizes them per click.
// Keep it bicolour, controlled.

export type Palette = {
  bg: string;
  fg: string;
  accent?: string;
};

export const PALETTES: Palette[] = [
  // Keep palettes strictly bicolour (no 3rd hue). Accent stays monochrome.
  { bg: "#0b0d0f", fg: "#e7e7e7", accent: "#e7e7e7" },
  { bg: "#000000", fg: "#1a1a1a", accent: "#1a1a1a" },
  { bg: "#111111", fg: "#d7d7d7", accent: "#d7d7d7" },
  { bg: "#e7e7e7", fg: "#0b0d0f", accent: "#0b0d0f" },
];

export function randomPalette(seed: number): Palette {
  const idx = Math.abs(seed) % PALETTES.length;
  return PALETTES[idx]!;
}
