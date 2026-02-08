import type { OScore, OCopy } from "./oNote.types";
import { O_COPY_TABLE } from "./oNote.table";

export function clampO(n: number): OScore {
  const x = Math.max(0, Math.min(11, Math.round(n)));
  return x as OScore;
}

export function applyDelta0(o: OScore, delta0: number): OScore {
  return clampO(o + delta0);
}

export function resolveCopy(o: OScore, min_o?: OScore): OCopy {
  const effective = min_o !== undefined ? (o < min_o ? min_o : o) : o;
  return O_COPY_TABLE[effective];
}

