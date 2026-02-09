import React, { useEffect, useMemo, useRef, useState } from "react";
import "./questDelta.css";
import { apiQuestDeltaAnswer, apiQuestDeltaEnd, apiQuestDeltaGet, apiQuestDeltaStart, getCsrf } from "@/api/apiClient";
import { useOEvent } from "@/oNote/oNote.hooks";
import { applyLandTheme } from "@/theme/landTheme";
import type { LandTheme } from "@/api/apiClient";

type LandType = "A" | "B" | "C" | null;

type QuestState = {
  state: "IDLE" | "RUNNING" | "ENDED";
  step: number;
  answers: {
    beauty_text?: string | null;
    coherence_score?: number | null;
    passage_choice?: string | null;
    land_glyph?: string | null;
    o_seed_line?: string | null;
    seal?: string | null;
  };
};

const NOTE_TTL_MS = 2400;

function clampLen(s: string, max = 220): string {
  const t = String(s || "");
  return t.length > max ? t.slice(0, max) : t;
}

function normalizeOneLine(s: string, max = 220): string {
  return clampLen(String(s || "").replace(/\s+/g, " ").trim(), max);
}

function pickStepHint(step: number): string {
  if (step === 1) return "après α β γ…";
  if (step === 2) return "≤ 9 mots";
  if (step === 3) return "passage";
  if (step === 4) return "glyph: α..ω";
  if (step === 5) return "seed: O.…";
  return "—";
}

function landTypeToPassageAnswer(t: LandType): string | null {
  if (t === "A") return "c";
  if (t === "B") return "d";
  if (t === "C") return "o";
  return null;
}

export function QuestDeltaPanel(props: {
  landType: LandType;
  refreshSession: () => void;
}) {
  const dispatch = useOEvent();
  const landType = props.landType;

  const [q, setQ] = useState<QuestState | null>(null);
  const [busy, setBusy] = useState<null | "sync" | "start" | "answer" | "end">(null);
  const [note, setNote] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");

  const noteTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!note) return;
    if (noteTimerRef.current) window.clearTimeout(noteTimerRef.current);
    noteTimerRef.current = window.setTimeout(() => {
      noteTimerRef.current = null;
      setNote(null);
    }, NOTE_TTL_MS);
    return () => {
      if (noteTimerRef.current) window.clearTimeout(noteTimerRef.current);
      noteTimerRef.current = null;
    };
  }, [note]);

  const sync = async (): Promise<void> => {
    try {
      const r = await apiQuestDeltaGet();
      if (r.ok) {
        setQ({
          state: r.data.state,
          step: Math.max(0, Math.floor(r.data.step || 0)),
          answers: r.data.answers || {},
        });
        return;
      }
      dispatch(r.status === 0 ? "network_error" : "form_validation_error");
      setNote(r.status === 0 ? "réseau: fragile" : `err:${String((r.data as any)?.error || r.status)}`);
    } finally {
    }
  };

  useEffect(() => {
    void sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSync = async () => {
    if (busy) return;
    setBusy("sync");
    try {
      await sync();
    } finally {
      setBusy(null);
    }
  };

  const requireCsrf = (): boolean => {
    if (getCsrf()) return true;
    setNote("csrf: …");
    props.refreshSession();
    return false;
  };

  const onStart = async () => {
    if (busy) return;
    if (!requireCsrf()) return;
    setBusy("start");
    try {
      const r = await apiQuestDeltaStart();
      if (!r.ok) {
        dispatch(r.status === 0 ? "network_error" : "form_validation_error");
        setNote(r.status === 0 ? "réseau: fragile" : `err:${String((r.data as any)?.error || r.status)}`);
        return;
      }
      setNote("Δ: …");
      setAnswer("");
      await sync();
    } finally {
      setBusy(null);
    }
  };

  const onAnswer = async (forced?: string) => {
    if (busy) return;
    if (!q || q.state !== "RUNNING") return;
    if (!requireCsrf()) return;
    const payload = normalizeOneLine(typeof forced === "string" ? forced : answer);
    if (!payload) {
      setNote("—");
      return;
    }

    setBusy("answer");
    try {
      const r = await apiQuestDeltaAnswer(payload);
      if (!r.ok) {
        const tag = String((r.data as any)?.error || r.status || "");
        if (r.status === 403 && tag === "csrf") {
          setNote("csrf: …");
          props.refreshSession();
        } else {
          setNote(r.status === 0 ? "réseau: fragile" : `err:${tag || "http"}`);
        }
        dispatch(r.status === 0 ? "network_error" : "form_validation_error");
        return;
      }

      // Server replies {ok:boolean, step:number, hint?:string, error?:string}
      const ok = Boolean((r.data as any)?.ok);
      const step = Number((r.data as any)?.step);
      if (!ok) {
        const hint = String((r.data as any)?.hint || (r.data as any)?.error || "—");
        setNote(clampLen(hint, 72));
      } else {
        setAnswer("");
        setNote(null);
      }

      // Optimistic step update; then sync for answers.
      if (Number.isFinite(step) && q) setQ({ ...q, step: Math.max(0, Math.floor(step)) });
      await sync();
    } finally {
      setBusy(null);
    }
  };

  const onEnd = async () => {
    if (busy) return;
    if (!q) return;
    if (!requireCsrf()) return;
    setBusy("end");
    try {
      const r = await apiQuestDeltaEnd();
      if (!r.ok) {
        const tag = String((r.data as any)?.error || r.status || "");
        if (r.status === 403 && tag === "csrf") {
          setNote("csrf: …");
          props.refreshSession();
        } else {
          setNote(r.status === 0 ? "réseau: fragile" : `err:${tag || "http"}`);
        }
        dispatch(r.status === 0 ? "network_error" : "form_validation_error");
        return;
      }

      const maybeTheme = (r.data as any)?.theme as LandTheme | null | undefined;
      if (maybeTheme && typeof maybeTheme === "object" && typeof (maybeTheme as any).glyph === "string") {
        applyLandTheme(maybeTheme);
      }
      const seal = String((r.data as any)?.seal || "");
      setNote(seal ? `seal:${seal}` : "ended");
      await sync();
    } finally {
      setBusy(null);
    }
  };

  const step = q?.state === "RUNNING" ? q.step : 0;
  const hint = useMemo(() => pickStepHint(step), [step]);
  const seal = q?.answers?.seal ? String(q.answers.seal) : "";
  const glyph = q?.answers?.land_glyph ? String(q.answers.land_glyph) : "";
  const hasSeed = Boolean(q?.answers?.o_seed_line);

  const passageAuto = useMemo(() => landTypeToPassageAnswer(landType), [landType]);
  const showAnswerInput = q?.state === "RUNNING" && (step === 1 || step === 2 || step === 4 || step === 5);
  const showPassage = q?.state === "RUNNING" && step === 3;
  const canEnd = q?.state === "RUNNING" && step === 5 && hasSeed;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.defaultPrevented) return;
    if (e.key !== "Enter") return;
    if (busy) return;
    e.preventDefault();
    if (showAnswerInput) void onAnswer();
  };

  const status = note
    ? note
    : busy
      ? "…"
      : q
        ? `${q.state.toLowerCase()} · ${q.state === "RUNNING" ? `step:${q.step}` : "—"}`
        : "Δ: …";

  return (
    <section className="qDeltaRoot" aria-label="quest delta">
      <div className="qDeltaTitle" aria-hidden="true">
        [ Δ ]
      </div>

      <div className="qDeltaMeta" aria-hidden="true">
        {glyph ? `glyph:${glyph}` : "glyph:—"} · {seal ? `seal:${seal}` : "seal:—"}
      </div>

      {q?.state === "IDLE" || q?.state === "ENDED" ? (
        <div className="qDeltaCmds" aria-label="delta cmds">
          <a
            className="qDeltaCmd"
            href="#"
            aria-label="start delta"
            data-disabled={busy ? "1" : "0"}
            onClick={(e) => {
              e.preventDefault();
              if (busy) return;
              void onStart();
            }}
          >
            START
          </a>
          <a
            className="qDeltaCmd"
            href="#"
            aria-label="sync delta"
            data-disabled={busy ? "1" : "0"}
            onClick={(e) => {
              e.preventDefault();
              if (busy) return;
              void onSync();
            }}
          >
            SYNC
          </a>
        </div>
      ) : null}

      {q?.state === "RUNNING" ? (
        <>
          <div className="qDeltaHint" aria-hidden="true">
            {hint}
          </div>

          {showPassage ? (
            <div className="qDeltaCmds" aria-label="passage">
              {passageAuto ? (
                <a
                  className="qDeltaCmd"
                  href="#"
                  aria-label="passage"
                  data-disabled={busy ? "1" : "0"}
                  onClick={(e) => {
                    e.preventDefault();
                    if (busy) return;
                    void onAnswer(passageAuto);
                  }}
                >
                  PASSAGE
                </a>
              ) : (
                <>
                  <a
                    className="qDeltaCmd"
                    href="#"
                    aria-label="passage c"
                    data-disabled={busy ? "1" : "0"}
                    onClick={(e) => {
                      e.preventDefault();
                      if (busy) return;
                      void onAnswer("c");
                    }}
                  >
                    C
                  </a>
                  <a
                    className="qDeltaCmd"
                    href="#"
                    aria-label="passage d"
                    data-disabled={busy ? "1" : "0"}
                    onClick={(e) => {
                      e.preventDefault();
                      if (busy) return;
                      void onAnswer("d");
                    }}
                  >
                    D
                  </a>
                  <a
                    className="qDeltaCmd"
                    href="#"
                    aria-label="passage o"
                    data-disabled={busy ? "1" : "0"}
                    onClick={(e) => {
                      e.preventDefault();
                      if (busy) return;
                      void onAnswer("o");
                    }}
                  >
                    O
                  </a>
                </>
              )}
            </div>
          ) : null}

          {showAnswerInput ? (
            <div className="qDeltaRow" aria-label="answer">
              <span className="qDeltaKey" aria-hidden="true">
                answer
              </span>
              <input
                className="qDeltaInput"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={step === 1 ? "δ" : step === 4 ? "α" : step === 5 ? "O. …" : "…"}
                aria-label="answer"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                onKeyDown={onKeyDown}
              />
            </div>
          ) : null}

          <div className="qDeltaCmds" aria-label="run cmds">
            {showAnswerInput ? (
              <a
                className="qDeltaCmd"
                href="#"
                aria-label="send answer"
                data-disabled={!answer || busy ? "1" : "0"}
                onClick={(e) => {
                  e.preventDefault();
                  if (!answer || busy) return;
                  void onAnswer();
                }}
              >
                SEND
              </a>
            ) : null}

            {canEnd ? (
              <a
                className="qDeltaCmd"
                href="#"
                aria-label="end delta"
                data-disabled={busy ? "1" : "0"}
                onClick={(e) => {
                  e.preventDefault();
                  if (busy) return;
                  void onEnd();
                }}
              >
                END
              </a>
            ) : null}

            <a
              className="qDeltaCmd"
              href="#"
              aria-label="sync delta"
              data-disabled={busy ? "1" : "0"}
              onClick={(e) => {
                e.preventDefault();
                if (busy) return;
                void onSync();
              }}
            >
              SYNC
            </a>
          </div>
        </>
      ) : null}

      <div className="qDeltaStatus" aria-live={note ? "polite" : "off"}>
        {status}
      </div>
    </section>
  );
}
