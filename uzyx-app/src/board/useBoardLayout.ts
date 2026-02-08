export type BoardBlockData = {
  id: string;
  title: string;
  subtitle?: string;
};

export type BoardPos = { x: number; y: number };

type LayoutOptions = {
  seed?: number;
  centerVoid?: { x0: number; y0: number; x1: number; y1: number };
};

const DEFAULT_VOID = { x0: 35, y0: 30, x1: 65, y1: 70 };

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function seededRand(seed: number) {
  let t = seed % 2147483647;
  if (t <= 0) t += 2147483646;
  return () => {
    t = (t * 48271) % 2147483647;
    return (t & 0x7fffffff) / 2147483647;
  };
}

function inVoid(p: BoardPos, v: typeof DEFAULT_VOID) {
  return p.x >= v.x0 && p.x <= v.x1 && p.y >= v.y0 && p.y <= v.y1;
}

function dist(a: BoardPos, b: BoardPos) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function useBoardLayout(blocks: BoardBlockData[], opts?: LayoutOptions) {
  const seed = opts?.seed ?? 13;
  const rand = seededRand(seed);
  const centerVoid = opts?.centerVoid ?? DEFAULT_VOID;

  const anchors: BoardPos[] = [
    { x: 12, y: 16 },
    { x: 86, y: 12 },
    { x: 10, y: 78 },
    { x: 88, y: 82 },
    { x: 50, y: 8 },
    { x: 92, y: 48 },
  ];

  const positions: Record<string, BoardPos> = {};
  const used: BoardPos[] = [];

  const jitter = () => ({
    x: (rand() - 0.5) * 10,
    y: (rand() - 0.5) * 10,
  });

  for (let i = 0; i < blocks.length; i++) {
    const base = anchors[i % anchors.length];
    let p: BoardPos = { x: base.x, y: base.y };
    let attempts = 0;

    while (attempts < 30) {
      const j = jitter();
      p = {
        x: clamp(base.x + j.x, 6, 94),
        y: clamp(base.y + j.y, 8, 92),
      };
      if (inVoid(p, centerVoid)) {
        attempts++;
        continue;
      }
      const ok = used.every((u) => dist(u, p) > 14);
      if (ok) break;
      attempts++;
    }

    used.push(p);
    positions[blocks[i]!.id] = p;
  }

  return { positions };
}
