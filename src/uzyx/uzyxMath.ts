// Alphabet state math: reference O (index 14). d = abs(idx - 14). I = 1/(d+1). n0te = round(I*9).

export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const O_INDEX = 14;

export function letterToIndex(letter: string): number {
  const up = (letter || "O").toUpperCase();
  const idx = ALPHABET.indexOf(up);
  return idx >= 0 ? idx : O_INDEX;
}

export function indexToLetter(idx: number): string {
  const i = ((idx % 26) + 26) % 26;
  return ALPHABET[i] ?? "O";
}

export function distanceToO(letter: string): number {
  const idx = letterToIndex(letter);
  return Math.abs(idx - O_INDEX);
}

export function intensityFromLetter(letter: string): number {
  const d = distanceToO(letter);
  return 1 / (d + 1);
}

export function noteFromLetter(letter: string): number {
  const I = intensityFromLetter(letter);
  const n = Math.round(I * 9);
  return clampInt(n, 0, 9);
}

export function mirrorAroundO(letter: string): string {
  const idx = letterToIndex(letter);
  const mirrored = O_INDEX + (O_INDEX - idx);
  return indexToLetter(mirrored);
}

export function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

export function clampInt(n: number, a: number, b: number): number {
  return Math.round(clamp(n, a, b));
}
