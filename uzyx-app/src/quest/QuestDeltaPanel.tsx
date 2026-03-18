import React, { useEffect, useMemo, useRef, useState } from "react";
import "./questDelta.css";
import {
  apiQuestDeltaAnswer,
  apiQuestDeltaEnd,
  apiQuestDeltaGet,
  apiQuestDeltaStart,
  getCsrf,
  type ApiPayload,
  type LandTheme,
  type LandType,
  type QuestDeltaGetResponse,
} from "@/api/apiClient";
import { useOEvent } from "@/oNote/oNote.hooks";
import { applyLandTheme } from "@/theme/landTheme";
import { QuestStep2Strates } from "@/quest/QuestStep2Strates";
import { useQuestVoiceAgent } from "@/quest/questVoiceAgent";

type QuestState = QuestDeltaGetResponse;
type QuestLandType = LandType | null;

const NOTE_TTL_MS = 2400;

function clampLen(s: string, max = 220): string {
  const t = String(s || "");
  return t.length > max ? t.slice(0, max) : t;
}

function normalizeOneLine(s: string, max = 220): string {
  return clampLen(String(s || "").replace(/\s+/g, " ").trim(), max);
}

function normalizeQuestStep(step: unknown): number {
  const n = Number(step);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, Math.floor(n)));
}

function pickStepHint(step: number): string {
  if (step === 1) return "après α β γ…";
  if (step === 2) return "≤ 9 mots";
  if (step === 3) return "passage";
  if (step === 4) return "glyph: α..ω";
  if (step === 5) return "seed: O.…";
  return "—";
}

function landTypeToPassageAnswer(t: QuestLandType): string | null {
  if (t === "A") return "c";
  if (t === "B") return "d";
  if (t === "C") return "o";
  return null;
}

function stepGuideText(step: number, landType: QuestLandType): string {
  if (step === 1) return "step 1/5: pose une ligne cohérente (après alpha beta gamma).";
  if (step === 2) return "step 2/5: synthèse courte (9 mots max).";
  if (step === 3) {
    const auto = landTypeToPassageAnswer(landType);
    if (auto) return `step 3/5: passage auto détecté (${auto.toUpperCase()}) via type de land.`;
    return "step 3/5: choisis un passage (C / D / O).";
  }
  if (step === 4) return "step 4/5: donne un glyph (une lettre alpha..omega).";
  if (step === 5) return "step 5/5: envoie une seed O. ; fin automatique après validation.";
  return "step 0/5: lance START pour initier delta.";
}

function apiErrorTag(data: ApiPayload, status: number): string {
  if (typeof data.error === "string" && data.error) return data.error;
  if (typeof data.detail === "string" && data.detail) return data.detail;
  return String(status || "http");
}

function applyLandThemeIfPresent(theme: LandTheme | null | undefined): void {
  if (theme === undefined) return;
  applyLandTheme(theme);
}

export function QuestDeltaPanel(props: {
  landType: QuestLandType;
  refreshSession: () => void;
}) {
  const dispatch = useOEvent();
  const landType = props.landType;
  const [q, setQ] = useState<QuestState | null>(null);
  const [busy, setBusy] = useState<null | "sync" | "start" | "answer" | "end">(null);
  const [note, setNote] = useState<string | null>(null);
  const [fails, setFails] = useState(0);
  const [localReadyToEnd, setLocalReadyToEnd] = useState(false);
  const [stepFx, setStepFx] = useState<{ token: number; dir: -1 | 0 | 1 }>({ token: 0, dir: 0 });
  const lastStepRef = useRef<{ phase: QuestState["state"] | null; step: number }>({ phase: null, step: 0 });

  const answerInputRef = useRef<HTMLInputElement>(null);
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
        const nextQ = {
          state: r.data.state,
          step: normalizeQuestStep(r.data.step),
          answers: r.data.answers ?? {},
        };
        setQ(nextQ);
        setLocalReadyToEnd(nextQ.state === "RUNNING" && nextQ.step === 5 && Boolean(nextQ.answers?.o_seed_line));
        return;
      }
      dispatch(r.status === 0 ? "network_error" : "form_validation_error");
      setFails((x) => Math.min(9, x + 1));
      setNote(r.status === 0 ? "réseau: fragile" : `err:${apiErrorTag(r.data, r.status)}`);
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
        setFails((x) => Math.min(9, x + 1));
        setNote(r.status === 0 ? "réseau: fragile" : `err:${apiErrorTag(r.data, r.status)}`);
        return;
      }
      setLocalReadyToEnd(false);
      setNote("Δ: …");
      setFails(0);
      await sync();
    } finally {
      setBusy(null);
    }
  };

  const onAnswer = async (forced?: string) => {
    if (busy) return;
    if (!q || q.state !== "RUNNING") return;
    if (!requireCsrf()) return;
    const stepBefore = normalizeQuestStep(q.step);
    const payload = normalizeOneLine(typeof forced === "string" ? forced : answerInputRef.current?.value ?? "");
    if (!payload) {
      setNote("—");
      return;
    }

    setBusy("answer");
    try {
      const r = await apiQuestDeltaAnswer(payload);
      if (!r.ok) {
        const tag = apiErrorTag(r.data, r.status);
        if (r.status === 403 && tag === "csrf") {
          setNote("csrf: …");
          props.refreshSession();
        } else {
          setNote(r.status === 0 ? "réseau: fragile" : `err:${tag || "http"}`);
        }
        dispatch(r.status === 0 ? "network_error" : "form_validation_error");
        setFails((x) => Math.min(9, x + 1));
        return;
      }

      const ok = r.data.ok;
      const step = Number(r.data.step);
      const readyToEnd = Boolean(r.data.ready_to_end);
      if (!ok) {
        const hint = r.data.hint || r.data.error || "—";
        setFails((x) => Math.min(9, x + 1));
        setNote(clampLen(hint, 72));
      } else {
        if (answerInputRef.current) answerInputRef.current.value = "";
        setNote(null);
        setFails(0);
        if (stepBefore === 5 && readyToEnd) setLocalReadyToEnd(true);
      }

      // Optimistic step update; then sync for answers.
      if (Number.isFinite(step)) {
        setQ((curr) => (curr ? { ...curr, step: normalizeQuestStep(step) } : curr));
      }
      await sync();

      // Simplicity: at step 5, auto-complete the quest after a valid seed.
      // Keep manual END as a fallback if this call fails.
      if (ok && stepBefore === 5 && readyToEnd) {
        const end = await apiQuestDeltaEnd();
        if (!end.ok) {
          const tag = apiErrorTag(end.data, end.status);
          if (end.status === 403 && tag === "csrf") {
            setNote("csrf: …");
            props.refreshSession();
          } else {
            setNote(end.status === 0 ? "réseau: fragile" : `err:${tag || "http"}`);
          }
          dispatch(end.status === 0 ? "network_error" : "form_validation_error");
          setFails((x) => Math.min(9, x + 1));
          return;
        }

        applyLandThemeIfPresent(end.data.theme);
        const seal = typeof end.data.seal === "string" ? end.data.seal : "";
        setNote(seal ? `seal:${seal}` : "ended");
        setFails(0);
        setLocalReadyToEnd(false);
        await sync();
      }
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
        const tag = apiErrorTag(r.data, r.status);
        if (r.status === 403 && tag === "csrf") {
          setNote("csrf: …");
          props.refreshSession();
        } else {
          setNote(r.status === 0 ? "réseau: fragile" : `err:${tag || "http"}`);
        }
        dispatch(r.status === 0 ? "network_error" : "form_validation_error");
        setFails((x) => Math.min(9, x + 1));
        return;
      }

      applyLandThemeIfPresent(r.data.theme);
      const seal = typeof r.data.seal === "string" ? r.data.seal : "";
      setNote(seal ? `seal:${seal}` : "ended");
      setFails(0);
      setLocalReadyToEnd(false);
      await sync();
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    const phase = q?.state ?? null;
    const step = phase === "RUNNING" ? normalizeQuestStep(q?.step) : 0;
    const prev = lastStepRef.current;
    if (phase !== prev.phase || step !== prev.step) {
      const dir: -1 | 0 | 1 =
        prev.phase === "RUNNING" && phase === "RUNNING" && step !== prev.step ? (step > prev.step ? 1 : -1) : 0;
      setStepFx((s) => ({ token: s.token + 1, dir }));
      lastStepRef.current = { phase, step };
      setFails(0);
    }
  }, [q?.state, q?.step]);

  const step = q?.state === "RUNNING" ? normalizeQuestStep(q.step) : 0;
  const hint = useMemo(() => pickStepHint(step), [step]);
  const stepGuide = useMemo(() => stepGuideText(step, landType), [step, landType]);
  const seal = q?.answers?.seal ? String(q.answers.seal) : "";
  const glyph = q?.answers?.land_glyph ? String(q.answers.land_glyph) : "";
  const hasSeed = Boolean(q?.answers?.o_seed_line);

  const passageAuto = useMemo(() => landTypeToPassageAnswer(landType), [landType]);
  const showAnswerInput = q?.state === "RUNNING" && (step === 1 || step === 2 || step === 4 || step === 5);
  const showPassage = q?.state === "RUNNING" && step === 3;
  const canEnd = q?.state === "RUNNING" && step === 5 && (hasSeed || localReadyToEnd);
  const showStep2 = q?.state === "RUNNING" && step === 2;

  const status = note
    ? note
    : busy
      ? "…"
      : q
        ? `${q.state.toLowerCase()} · ${q.state === "RUNNING" ? `step:${step}/5` : "—"}`
        : "Δ: …";
  const stepFxClass = stepFx.dir > 0 ? "is-step-forward" : stepFx.dir < 0 ? "is-step-back" : "";

  const voice = useQuestVoiceAgent({
    phase: q?.state ?? "IDLE",
    step,
    fails,
    hint,
    status,
  });

  return (
    <section className={`qDeltaRoot ${stepFxClass}`.trim()} aria-label="quest delta">
      <div
        className="qDeltaTitle"
        aria-hidden="true"
        onPointerDown={voice.holdHandlers.onPointerDown}
        onPointerMove={voice.holdHandlers.onPointerMove}
        onPointerUp={voice.holdHandlers.onPointerUp}
        onPointerCancel={voice.holdHandlers.onPointerCancel}
      >
        [ Δ ]
      </div>

      <div className="qDeltaMeta" aria-hidden="true">
        {glyph ? `glyph:${glyph}` : "glyph:—"} · {seal ? `seal:${seal}` : "seal:—"}
      </div>

      {!q ? (
        <div className="qDeltaCmds" aria-label="delta bootstrap cmds">
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
          <div key={`progress-${stepFx.token}`} className={`qDeltaProgress ${stepFxClass}`.trim()} aria-hidden="true">
            {[1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                className={`qDeltaStep ${step > n ? "is-done" : ""} ${step === n ? "is-current" : ""} ${step === n && stepFx.dir !== 0 ? "is-enter" : ""}`}
              >
                {n}
              </span>
            ))}
          </div>

          <div key={`guide-${stepFx.token}-${step}`} className={`qDeltaGuide ${stepFxClass}`.trim()} aria-hidden="true">
            {stepGuide}
          </div>

          {showStep2 ? <QuestStep2Strates /> : null}

          <div key={`hint-${stepFx.token}-${step}`} className={`qDeltaHint ${stepFxClass}`.trim()} aria-hidden="true">
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
                key={`answer-input-${step}`}
                className="qDeltaInput"
                ref={answerInputRef}
                defaultValue=""
                placeholder={step === 1 ? "δ" : step === 4 ? "α" : step === 5 ? "O. …" : "…"}
                aria-label="answer"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.defaultPrevented && !busy) {
                    e.preventDefault();
                    void onAnswer();
                  }
                }}
              />
            </div>
          ) : null}

          <div className="qDeltaCmds" aria-label="run cmds">
            {showAnswerInput ? (
              <a
                className="qDeltaCmd"
                href="#"
                aria-label="send answer"
                // Le bouton n'est plus désactivé par le contenu, mais le handler rejette les envois vides.
                data-disabled={busy ? "1" : "0"}
                onClick={(e) => {
                  e.preventDefault();
                  if (busy) return;
                  void onAnswer();
                }}
              >
                SEND (↵)
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
                END (fallback)
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

      <div key={`status-${stepFx.token}-${status}`} className={`qDeltaStatus ${stepFxClass}`.trim()} aria-live={note ? "polite" : "off"}>
        {status}
      </div>
    </section>
  );
}
