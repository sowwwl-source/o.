export type StreamParams = {
  density: number;
  speed: number;
  amplitude: number;
  revealRate: number;
};

export type Presence = {
  id: string;
  hz: number;
  name: string;
};

// STR3M: points+degrés (Canvas 2D)
export type Pt = { x: number; y: number; deg: number; phase: number; amp: number; presence?: { id: string; hz: number; name: string } };

export type StreamPoint = Pt;

// STR3M: points+degrés (Canvas 2D)
export function updatePt(pt: Pt, t: number) {
  const wave = Math.sin(pt.x * 2.3 + pt.y * 1.7 - t * 0.6 + pt.phase);
  pt.y += wave * pt.amp * 0.002; // micro déplacement
}

function wrap01(n: number) {
  let x = n % 1;
  if (x < 0) x += 1;
  return x;
}

function degFromCenter(x: number, y: number) {
  const rad = Math.atan2(y - 0.5, x - 0.5);
  const deg = (rad * 180) / Math.PI;
  return Math.round((deg + 360) % 360);
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function getPresences(count = 24): Presence[] {
  const pool = ["nu", "il", "ore", "via", "lo", "rr", "xi", "n1", "ora", "loi", "aze", "mot"];
  const list: Presence[] = [];
  for (let i = 0; i < count; i++) {
    const name = pool[i % pool.length] + String((i % 9) + 1);
    list.push({
      id: `p-${i}`,
      name,
      hz: 0.15 + ((i % 9) / 9) * 0.85,
    });
  }
  return list;
}

export function initPoints(density: number, presences: Presence[]): StreamPoint[] {
  const points: StreamPoint[] = [];
  for (let i = 0; i < density; i++) {
    const x = Math.random();
    const y = Math.random();
    const phase = Math.random() * Math.PI * 2;
    const amp = rand(0.55, 1.95);
    const presence = Math.random() < 0.04 && presences.length > 0 ? presences[i % presences.length] : undefined;
    points.push({ x, y, deg: degFromCenter(x, y), phase, amp, presence });
  }
  return points;
}

export function stepPoints(points: StreamPoint[], t: number, params: StreamParams) {
  const drift = params.speed * 0.016;
  const ampK = Math.max(0.25, Math.min(1.4, params.amplitude / 18));
  for (const p of points) {
    p.x = wrap01(p.x + drift * 0.00055);
    updatePt(p, t);
    p.y = wrap01(p.y + (Math.sin(p.phase + t * 0.24) * 0.0012 + Math.cos(t * 0.18 + p.x * 2.2) * 0.0009) * (0.55 + ampK));
    p.deg = degFromCenter(p.x, p.y);
  }
}

