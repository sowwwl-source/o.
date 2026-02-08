import type { OCopy, OEvent, OScore, ORenderMode } from "./oNote.types";
import { applyDelta0 } from "./oNote.math";

type Ladder = {
  event: OEvent;
  delta: number;
  // Ordered by rising min-o.
  ladder: Array<{ min: OScore; micro: string; short: string; plain: string }>;
};

export const DELTA0: Record<OEvent, number> = {
  auth_passkey_success: -4,
  session_restored: -3,
  land_created: -3,
  completed_first_run: -2,

  auth_passkey_cancelled: +1,
  auth_passkey_failed: +2,
  network_error: +2,
  form_validation_error: +1,
  repeated_error_threshold: +2,
};

export const O_NOTE_TABLE: Record<OEvent, Ladder> = {
  auth_passkey_success: {
    event: "auth_passkey_success",
    delta: DELTA0.auth_passkey_success,
    ladder: [
      { min: 0, micro: "ok", short: "passkey prise", plain: "Passkey prise. Ça tient." },
      { min: 6, micro: "ok", short: "prise", plain: "Ça prend." },
      { min: 10, micro: "ok", short: "tenu", plain: "Tenue." },
    ],
  },
  session_restored: {
    event: "session_restored",
    delta: DELTA0.session_restored,
    ladder: [
      { min: 0, micro: "ok", short: "session", plain: "Session retrouvée." },
      { min: 8, micro: "ok", short: "revient", plain: "Ça revient." },
    ],
  },
  land_created: {
    event: "land_created",
    delta: DELTA0.land_created,
    ladder: [
      { min: 0, micro: "ok", short: "lande créée", plain: "Lande créée." },
      { min: 7, micro: "ok", short: "la lande", plain: "La Lande prend." },
    ],
  },
  completed_first_run: {
    event: "completed_first_run",
    delta: DELTA0.completed_first_run,
    ladder: [
      { min: 0, micro: "ok", short: "passage", plain: "Premier passage." },
      { min: 9, micro: "ok", short: "déjà", plain: "Déjà." },
    ],
  },

  auth_passkey_cancelled: {
    event: "auth_passkey_cancelled",
    delta: DELTA0.auth_passkey_cancelled,
    ladder: [
      { min: 0, micro: "—", short: "annulé", plain: "Annulé." },
      { min: 6, micro: "—", short: "pas là", plain: "Pas là." },
    ],
  },
  auth_passkey_failed: {
    event: "auth_passkey_failed",
    delta: DELTA0.auth_passkey_failed,
    ladder: [
      { min: 0, micro: "err", short: "passkey", plain: "Passkey non disponible ici." },
      { min: 6, micro: "err", short: "pas pris", plain: "Ça n’a pas pris." },
    ],
  },
  network_error: {
    event: "network_error",
    delta: DELTA0.network_error,
    ladder: [
      { min: 0, micro: "net", short: "réseau", plain: "Réseau fragile. Réessayer." },
      { min: 8, micro: "net", short: "fragile", plain: "Fragile." },
    ],
  },
  form_validation_error: {
    event: "form_validation_error",
    delta: DELTA0.form_validation_error,
    ladder: [
      { min: 0, micro: "form", short: "forme", plain: "Forme incomplète. Vérifier." },
      { min: 7, micro: "form", short: "à reprendre", plain: "À reprendre." },
    ],
  },
  repeated_error_threshold: {
    event: "repeated_error_threshold",
    delta: DELTA0.repeated_error_threshold,
    ladder: [
      { min: 0, micro: "…", short: "pause", plain: "Pause. Respirer." },
      { min: 8, micro: "…", short: "silence", plain: "Silence." },
    ],
  },
} as const;

export function applyDelta(o: OScore, event: OEvent): OScore {
  return applyDelta0(o, DELTA0[event] ?? 0);
}

export function pickCopy(event: OEvent, o: OScore, mode: ORenderMode): OCopy {
  const row = O_NOTE_TABLE[event];
  const ladder = row?.ladder ?? [];
  let best = ladder[0];
  for (const step of ladder) {
    if (o >= step.min) best = step;
  }
  const text =
    mode === "glyph"
      ? `o:${o}`
      : mode === "micro"
        ? best?.micro ?? "—"
        : mode === "short"
          ? best?.short ?? "—"
          : best?.plain ?? "—";
  return { o, mode, text };
}
