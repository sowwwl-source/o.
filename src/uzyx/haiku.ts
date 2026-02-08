// Haiku-ish fragments (not strict syllables). No instruction, no explicit "you must".
// Seeded by timeDigit; prosody is handled in voice.ts.

const L1 = ["…", "ça tient", "bord", "lisse", "encore", "silence", "un pli"];
const L2 = [
  "une ondulation",
  "un creux discret",
  "la page respire",
  "un fil sans bruit",
  "un pas qui manque",
  "un angle calme",
];
const L3 = ["laisse", "reste", "pas là", "continue", "attends", "rien", "encore"];

const L2_TOWARD_O = [
  "la rime revient",
  "un rythme se pose",
  "le centre est proche",
  "un écart s'éteint",
  "un geste s'aligne",
];

function pick(arr: string[], seed: number, k: number): string {
  return arr[(seed + k) % arr.length]!;
}

export function genHaiku(seedDigit: number, towardO: boolean): string {
  // 3 segments separated by " / " (spoken as subtle pause)
  const l1 = pick(L1, seedDigit, 0);
  const l2 = towardO ? pick(L2_TOWARD_O, seedDigit, 1) : pick(L2, seedDigit, 2);
  const l3 = pick(L3, seedDigit, 3);

  // Occasionally return incomplete fragment
  if ((seedDigit + (towardO ? 1 : 0)) % 7 === 0) {
    return `${l1} / ${l2} / …`;
  }
  return `${l1} / ${l2} / ${l3}`;
}
