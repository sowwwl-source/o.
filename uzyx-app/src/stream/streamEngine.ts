export type StreamParams = {
  density: number;
  speed: number;
  amplitude: number;
  revealRate: number;
};

export type Presence = {
  id: string;
  pseudo: string;
  freq: number; // 0..1
};

export type StreamPoint = {
  x: number;
  y: number;
  phase: number;
  angle: number;
  amp: number;
  presence?: Presence;
};

export type EngineState = {
  points: StreamPoint[];
  presences: Presence[];
};

export function getPresences(count = 24): Presence[] {
  const pool = ["nu", "il", "ore", "via", "lo", "rr", "xi", "n1", "ora", "loi"];
  const list: Presence[] = [];
  for (let i = 0; i < count; i++) {
    const pseudo = pool[i % pool.length] + String((i % 9) + 1);
    list.push({
      id: `p-${i}`,
      pseudo,
      freq: (i % 7) / 6,
    });
  }
  return list;
}

export function initPoints(
  width: number,
  height: number,
  density: number,
  presences: Presence[]
): StreamPoint[] {
  const points: StreamPoint[] = [];
  for (let i = 0; i < density; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const angle = Math.random() * Math.PI * 2;
    const phase = Math.random() * Math.PI * 2;
    const amp = 0.6 + Math.random() * 1.8;
    const presence = Math.random() < 0.04 ? presences[i % presences.length] : undefined;
    points.push({ x, y, angle, phase, amp, presence });
  }
  return points;
}

export function stepPoints(
  points: StreamPoint[],
  width: number,
  height: number,
  t: number,
  params: StreamParams
) {
  const drift = params.speed * 0.0009;
  for (const p of points) {
    const wave = Math.sin(p.phase + t * drift + p.x * 0.002) * params.amplitude;
    p.x += Math.cos(p.angle) * 0.05 + wave * 0.01;
    p.y += Math.sin(p.angle) * 0.04 + Math.sin(p.phase + t * 0.0007) * 0.01;

    if (p.x < 0) p.x = width;
    if (p.x > width) p.x = 0;
    if (p.y < 0) p.y = height;
    if (p.y > height) p.y = 0;
  }
}
