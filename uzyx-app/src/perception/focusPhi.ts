function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function hypot2(x: number, y: number) {
  return Math.hypot(x, y);
}

function norm(v: { x: number; y: number }) {
  const m = hypot2(v.x, v.y);
  if (m <= 1e-6) return { x: 0, y: 0, m: 0 };
  return { x: v.x / m, y: v.y / m, m };
}

function dot(a: { x: number; y: number }, b: { x: number; y: number }) {
  return a.x * b.x + a.y * b.y;
}

export type FocusPhi = {
  id: string;
  fx: number;
  fy: number;
  /** 0..1 confidence (stability) */
  weight: number;
};

// focusPhi: choisir un nœud probable (sans réticule)
export function computeFocusPhi(nodes: { id: string; x: number; y: number }[], pointer: { x: number; y: number }, prevFocus?: string) {
  // score: angle + distance + stabilité (simplifié)
  // retourne un vecteur focus (fx,fy) vers le nœud sélectionné + id
  const center = { x: 0.5, y: 0.5 };
  const p = { x: clamp(pointer.x, 0, 1), y: clamp(pointer.y, 0, 1) };

  const pDirRaw = { x: p.x - center.x, y: p.y - center.y };
  const pDir = norm(pDirRaw);

  let best: { id: string; x: number; y: number; score: number } | null = null;
  let second = -Infinity;

  for (const n of nodes) {
    const pos = { x: clamp(n.x, 0, 1), y: clamp(n.y, 0, 1) };
    const nDir = norm({ x: pos.x - center.x, y: pos.y - center.y });

    // angle: prefer nodes in the pointer direction (when pointer has direction).
    const align = pDir.m > 0.06 && nDir.m > 0.01 ? clamp(dot({ x: pDir.x, y: pDir.y }, { x: nDir.x, y: nDir.y }), -1, 1) : 0;
    const angleScore = (align + 1) / 2; // 0..1

    // distance: prefer spatial proximity (soft, avoids jumping).
    const dist = hypot2(p.x - pos.x, p.y - pos.y); // 0..~1.4
    const distScore = 1 - clamp(dist / 0.95, 0, 1); // 1 near, 0 far

    // stability: small bias to keep previous focus.
    const stability = n.id === prevFocus ? 0.08 : 0;

    const score = angleScore * 0.62 + distScore * 0.30 + stability;
    if (best === null || score > best.score) {
      if (best !== null) second = Math.max(second, best.score);
      best = { id: n.id, x: pos.x, y: pos.y, score };
    } else {
      second = Math.max(second, score);
    }
  }

  if (!best) {
    return { id: prevFocus ?? "HAUT", fx: center.x, fy: center.y, weight: 0 } satisfies FocusPhi;
  }

  const gap = clamp(best.score - second, 0, 0.25) / 0.25; // 0..1
  const weight = clamp(best.score * 0.7 + gap * 0.3, 0, 1);

  return { id: best.id, fx: best.x, fy: best.y, weight } satisfies FocusPhi;
}

