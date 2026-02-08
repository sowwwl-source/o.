import { graph } from "../graph/graph";

// molette: rosace adjacente depuis graphe
export function getAdjacent(nodeId: string) {
  return (graph as any)[nodeId] ?? [];
}

// molette selection
// angle -> index
export function angleToIndex(theta: number, n: number) {
  return ((Math.round((theta / (2 * Math.PI)) * n) % n) + n) % n;
}

export function normalizeAngle(theta: number) {
  const tau = Math.PI * 2;
  let t = theta % tau;
  if (t <= -Math.PI) t += tau;
  if (t > Math.PI) t -= tau;
  return t;
}

