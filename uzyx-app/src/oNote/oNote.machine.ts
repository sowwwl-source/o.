import type { OEvent, OScore } from "./oNote.types";
import { applyDelta0, clampO } from "./oNote.math";
import { DELTA0 } from "./oNoteTable";

export type ONoteMachineState = {
  o_score: OScore;
  consecutive_errors: number;
};

const ERROR_EVENTS: ReadonlySet<OEvent> = new Set([
  "auth_passkey_cancelled",
  "auth_passkey_failed",
  "network_error",
  "form_validation_error",
  "repeated_error_threshold",
]);

const SUCCESS_EVENTS: ReadonlySet<OEvent> = new Set([
  "auth_passkey_success",
  "session_restored",
  "land_created",
  "completed_first_run",
]);

export function isErrorEvent(event: OEvent): boolean {
  return ERROR_EVENTS.has(event);
}

export function isSuccessEvent(event: OEvent): boolean {
  return SUCCESS_EVENTS.has(event);
}

export function initialScoreFromContext(ctx: {
  hasSession: boolean;
  hasLand: boolean;
  isNewDevice?: boolean;
}): OScore {
  let base = 7;
  if (ctx.hasSession && ctx.hasLand) base = 2;
  else if (ctx.hasSession) base = 4;
  if (ctx.isNewDevice) base += 2;
  return clampO(base);
}

export function reduce(state: ONoteMachineState, event: OEvent): ONoteMachineState {
  const isErr = isErrorEvent(event);
  const consecutive_errors = isErr ? state.consecutive_errors + 1 : 0;

  // base delta comes from the incoming event.
  // if we see >=2 consecutive errors, apply the threshold delta for that transition.
  const appliedEvent: OEvent = isErr && consecutive_errors >= 2 ? "repeated_error_threshold" : event;
  const delta0 = DELTA0[appliedEvent] ?? 0;

  let o_score = applyDelta0(state.o_score, delta0);

  // If the user keeps hitting errors, force the score into the explicit zone.
  if (consecutive_errors > 3) o_score = clampO(Math.max(o_score, 9));

  return { o_score, consecutive_errors };
}

