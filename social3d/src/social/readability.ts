export type StabilitySources = {
  cameraMotion: number; // normalized 0..~1
  pointerMotion: number; // normalized 0..~1
  deviceMotion: number; // normalized 0..~1
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class StabilityEngine {
  private s = 0.35;
  private readonly fallFast = 2.4;
  private readonly riseSlow = 0.55;
  private readonly threshold = 0.55;

  value() {
    return this.s;
  }

  update(dt: number, src: StabilitySources) {
    const motion = clamp(
      src.cameraMotion * 0.60 + src.pointerMotion * 0.25 + src.deviceMotion * 0.55,
      0,
      2,
    );

    if (motion > this.threshold) {
      const k = clamp(motion / this.threshold, 1, 3);
      this.s -= dt * this.fallFast * k;
    } else {
      const k = 1 - motion / this.threshold;
      this.s += dt * this.riseSlow * k;
    }

    this.s = clamp(this.s, 0, 1);
    return this.s;
  }
}

export function obfuscateText(text: string, stability: number, timeMs: number, seed: number): string {
  const s = clamp(stability, 0, 1);
  if (!text) return text;

  const replaceProb = (() => {
    if (s < 0.7) return 1.0 - (s / 0.7) * 0.2; // 1.0 -> 0.8
    return 0.8 * (1 - smoothstep(0.7, 0.95, s)); // 0.8 -> 0
  })();

  const phase = Math.floor(timeMs / 110);
  const prng = mulberry32((seed ^ (phase * 2654435761)) >>> 0);
  const unstableGlyphs = ['I', '/', '\\', '|'];

  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ' || ch === '\n' || ch === '\t') {
      out += ch;
      continue;
    }

    const r = prng();
    if (r < replaceProb) {
      const g = s < 0.35 ? 'I' : unstableGlyphs[(i + phase) % unstableGlyphs.length];
      out += g;
    } else {
      out += ch;
    }
  }
  return out;
}

