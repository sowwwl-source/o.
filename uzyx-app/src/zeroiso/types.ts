export type ZeroisoMode = 0 | 1 | 3;

export type ZeroisoGrid = {
  w: number;
  h: number;
};

export type DensityGrid = {
  w: number;
  h: number;
  /** row-major, values clamped 0..1 */
  data: Float32Array;
};

export type ZeroisoCharset = {
  /** background ramp (low density) */
  ramp: string;
  /** used for empty cells */
  empty: string;
};

export type ZeroisoFrame = {
  text: string;
  meta?: {
    kind: "seed" | "scanA" | "scanB" | "scanC" | "mix";
    phase?: number;
    deg?: number;
  };
};

export type ZeroisoBuildResult = {
  mode: ZeroisoMode;
  seed: string;
  grid: ZeroisoGrid;
  fps: number;
  frames: ZeroisoFrame[];
};

export type ZeroisoEngineConfig = {
  grid: ZeroisoGrid;
  fps: number;
  frames: number;
  charset: ZeroisoCharset;
  fragments: string[];
};

export type ZeroisoScanSlot = "A" | "B" | "C";

