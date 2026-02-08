function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export type BlurLayers = {
  orient: number;
  depth: number;
  threshold: number;
};

export type BlurMode = {
  /** Base + misalignment + speed coefficients (px). */
  B0: number;
  B1: number;
  B2: number;
  /** Depth coefficient (px). */
  Bd: number;
  /** Threshold peak (px). */
  peak: number;
  /** Threshold sigma (blend units, 0..1). */
  sigma: number;
  /** Safety clamps (px). */
  clampOrient: number;
  clampDepth: number;
  clampThreshold: number;
};

export const blurModes = {
  board: {
    B0: 0,
    B1: 0.55,
    B2: 0.35,
    Bd: 0.35,
    peak: 0.6,
    sigma: 0.22,
    clampOrient: 1.8,
    clampDepth: 1.4,
    clampThreshold: 1.2,
  },
  ferry: {
    B0: 0.05,
    B1: 0.8,
    B2: 0.55,
    Bd: 0.85,
    peak: 0.9,
    sigma: 0.22,
    clampOrient: 2.6,
    clampDepth: 1.9,
    clampThreshold: 1.4,
  },
  deltaZ: {
    B0: 0.2,
    B1: 2.1,
    B2: 1.6,
    Bd: 2.0,
    peak: 3.2,
    sigma: 0.19,
    clampOrient: 4.6,
    clampDepth: 3.2,
    clampThreshold: 4.2,
  },
  stream: {
    B0: 0.1,
    B1: 1.35,
    B2: 1.1,
    Bd: 1.2,
    peak: 1.1,
    sigma: 0.2,
    clampOrient: 3.4,
    clampDepth: 2.4,
    clampThreshold: 2.0,
  },
  land: {
    B0: 0,
    B1: 0.9,
    B2: 0.55,
    Bd: 0.7,
    peak: 0.4,
    sigma: 0.24,
    clampOrient: 2.2,
    clampDepth: 1.6,
    clampThreshold: 1.0,
  },
} as const satisfies Record<string, BlurMode>;

export type BlurModeId = keyof typeof blurModes;

export function computeBlurLayers(mode: BlurMode, opts: { d: number; s: number; depthIndex: number; focusWeight: number; tt: number; reducedMotion?: boolean }): BlurLayers {
  const d = clamp(opts.d, 0, 1);
  const s = clamp(opts.s, 0, 1);
  const depthIndex = clamp(opts.depthIndex, 0, 1);
  const focusWeight = clamp(opts.focusWeight, 0, 1);
  const tt = clamp(opts.tt, 0, 1);

  const B0 = mode.B0;
  const B1 = mode.B1;
  const B2 = mode.B2;
  const Bd = mode.Bd;
  const peak = mode.peak;
  const sigma = Math.max(1e-4, mode.sigma);

  // blur intensities
  const blur_orient = B0 + B1 * d + B2 * s; // d = désalignement, s = speed
  const blur_depth = Bd * depthIndex * (1 - focusWeight);
  const mid = 0.5;
  const blur_threshold = peak * Math.exp(-((tt - mid) ** 2) / (sigma ** 2));

  const reduced = Boolean(opts.reducedMotion);
  const k = reduced ? 0.18 : 1;

  return {
    orient: clamp(blur_orient * k, 0, mode.clampOrient),
    depth: clamp(blur_depth * k, 0, mode.clampDepth),
    threshold: clamp(blur_threshold * k, 0, mode.clampThreshold),
  };
}
