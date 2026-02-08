export type OScore = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export type ORenderMode = "glyph" | "micro" | "short" | "plain";

export type OCopy = { o: OScore; mode: ORenderMode; text: string };

export type OEvent =
  | "auth_passkey_success"
  | "session_restored"
  | "land_created"
  | "completed_first_run"
  | "auth_passkey_cancelled"
  | "auth_passkey_failed"
  | "network_error"
  | "form_validation_error"
  | "repeated_error_threshold";

