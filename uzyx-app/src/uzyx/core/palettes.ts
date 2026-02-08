// Define a few palettes. FailSafe randomizes them per click.
// Keep it bicolour, controlled.

export type Palette = {
  bg: string;
  fg: string;
  accent?: string;
};

export const PALETTES: Palette[] = [
  { bg: "#000000", fg: "#F2F2F2", accent: "#7A7A7A" },
  { bg: "#0B0B12", fg: "#EAE6DF", accent: "#6D7A8A" },
  { bg: "#F6F2EA", fg: "#141414", accent: "#8A6D5A" },
  { bg: "#0F1411", fg: "#EAF2EC", accent: "#6E8A7A" },
  { bg: "#101010", fg: "#D7D7D7", accent: "#B0B0B0" },
];

export function randomPalette(seed: number): Palette {
  const idx = Math.abs(seed) % PALETTES.length;
  return PALETTES[idx]!;
}
