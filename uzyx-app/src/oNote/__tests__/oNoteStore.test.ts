import { describe, expect, it } from "vitest";
import { reduce, initialScoreFromContext, isErrorEvent, isSuccessEvent } from "../oNote.machine";

describe("oNote.machine", () => {
  it("classifies events", () => {
    expect(isSuccessEvent("session_restored")).toBe(true);
    expect(isErrorEvent("network_error")).toBe(true);
  });

  it("resets consecutive_errors on success", () => {
    const s1 = { o_score: 7 as const, consecutive_errors: 2 };
    const s2 = reduce(s1, "session_restored");
    expect(s2.consecutive_errors).toBe(0);
  });

  it("applies repeated_error_threshold on 2nd consecutive error", () => {
    const s1 = { o_score: 7 as const, consecutive_errors: 0 };
    const s2 = reduce(s1, "form_validation_error"); // +1
    expect(s2.consecutive_errors).toBe(1);
    const s3 = reduce(s2, "form_validation_error"); // threshold applies (+2)
    expect(s3.consecutive_errors).toBe(2);
    expect(s3.o_score).toBeGreaterThan(s2.o_score);
  });

  it("forces explicit zone after many errors", () => {
    let s = { o_score: 2 as const, consecutive_errors: 0 };
    s = reduce(s, "network_error");
    s = reduce(s, "network_error");
    s = reduce(s, "network_error");
    s = reduce(s, "network_error");
    expect(s.consecutive_errors).toBeGreaterThan(3);
    expect(s.o_score).toBeGreaterThanOrEqual(9);
  });

  it("computes initial score from context", () => {
    expect(initialScoreFromContext({ hasSession: false, hasLand: false })).toBeGreaterThanOrEqual(0);
    expect(initialScoreFromContext({ hasSession: true, hasLand: true })).toBeLessThanOrEqual(4);
  });
});
