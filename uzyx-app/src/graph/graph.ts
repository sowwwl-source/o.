export type NodeId = "LAND" | "FERRY" | "STR3M" | "CONTACT" | "HAUT";

export const graph = {
  HAUT: ["LAND", "FERRY", "STR3M", "CONTACT"],
  LAND: ["HAUT", "STR3M"],
  FERRY: ["HAUT", "CONTACT"],
  STR3M: ["HAUT", "LAND"],
  CONTACT: ["HAUT", "FERRY"],
} as const satisfies Record<NodeId, readonly NodeId[]>;

export type NodePos = {
  /** 0..100 viewport-percent space (logical board space). */
  x: number;
  y: number;
};

export type Edge = readonly [NodeId, NodeId];

export const edges: readonly Edge[] = (() => {
  const out: Edge[] = [];
  const seen = new Set<string>();
  (Object.keys(graph) as NodeId[]).forEach((a) => {
    graph[a].forEach((b) => {
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push(a < b ? ([a, b] as const) : ([b, a] as const));
    });
  });
  return out;
})();

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function seeded(seed: number) {
  let t = seed % 2147483647;
  if (t <= 0) t += 2147483646;
  return () => {
    t = (t * 48271) % 2147483647;
    return (t & 0x7fffffff) / 2147483647;
  };
}

/**
 * Constellation layout:
 * - HAUT centered (50/50)
 * - other nodes pushed toward corners/edges
 * - deterministic jitter so nothing is perfectly aligned
 */
export function computeConstellation(seed = 7): Record<NodeId, NodePos> {
  const rand = seeded(seed);
  const jDeg = () => (rand() - 0.5) * 14; // ±7°
  const jR = () => (rand() - 0.5) * 6; // ±3

  const center: NodePos = { x: 50, y: 50 };

  const base = {
    LAND: { deg: 224, r: 46 },
    FERRY: { deg: 332, r: 44 },
    CONTACT: { deg: 128, r: 45 },
    STR3M: { deg: 46, r: 43 },
  } as const satisfies Record<Exclude<NodeId, "HAUT">, { deg: number; r: number }>;

  const polar = (deg: number, r: number): NodePos => {
    const rad = (deg * Math.PI) / 180;
    const x = center.x + Math.cos(rad) * r;
    const y = center.y + Math.sin(rad) * r;
    return {
      x: clamp(x, 6, 94),
      y: clamp(y, 8, 92),
    };
  };

  return {
    HAUT: center,
    LAND: polar(base.LAND.deg + jDeg(), base.LAND.r + jR()),
    FERRY: polar(base.FERRY.deg + jDeg(), base.FERRY.r + jR()),
    STR3M: polar(base.STR3M.deg + jDeg(), base.STR3M.r + jR()),
    CONTACT: polar(base.CONTACT.deg + jDeg(), base.CONTACT.r + jR()),
  };
}

export function neighbors(id: NodeId): readonly NodeId[] {
  return graph[id];
}
