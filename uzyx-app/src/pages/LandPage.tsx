import React, { useEffect, useMemo, useRef, useState } from "react";
import "./land.css";
import { HautPoint } from "@/components/HautPoint";
import { usePerceptionStore } from "@/perception/PerceptionProvider";
import { isInverted, setInvert } from "@/theme/invert";
import { useONoteAPI } from "@/oNote/oNote.store";
import { apiLandStateGet, apiLandStateSave, getCsrf } from "@/api/apiClient";
import { useOEvent } from "@/oNote/oNote.hooks";
import { useSession } from "@/api/sessionStore";
import { QuestDeltaPanel } from "@/quest/QuestDeltaPanel";

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function lambdaLabel(v: number): string {
  if (v <= 0.32) return "calme";
  if (v >= 0.68) return "tension";
  return "oscillation";
}

function isInteractiveTarget(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return false;
  return Boolean(t.closest("a,input,textarea,select,[role='slider']"));
}

const SAVE_DEBOUNCE_MS = 650;
const NOTE_TTL_MS = 2400;

export function LandPage() {
  const store = usePerceptionStore();
  const { setContext } = useONoteAPI();
  const dispatch = useOEvent();
  const session = useSession();
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    store.setBaseProfile("land");
  }, [store]);

  useEffect(() => {
    setContext({ hasLand: true });
  }, [setContext]);

  // Entering LAND is an interior flip (inversion is functional, not cosmetic).
  useEffect(() => {
    const prev = isInverted();
    setInvert(true);
    return () => setInvert(prev);
  }, []);

  const invertTapRef = useRef<{
    pointerId: number | null;
    t0: number;
    x0: number;
    y0: number;
    moved: boolean;
  }>({ pointerId: null, t0: 0, x0: 0, y0: 0, moved: false });

  const canInvertOnClick = () => document.documentElement.dataset.landInvertOnClick !== "false";

  const onRootPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (!canInvertOnClick()) return;
    if (isInteractiveTarget(e.target)) return;
    invertTapRef.current.pointerId = e.pointerId;
    invertTapRef.current.t0 = performance.now();
    invertTapRef.current.x0 = e.clientX;
    invertTapRef.current.y0 = e.clientY;
    invertTapRef.current.moved = false;
  };

  const onRootPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = invertTapRef.current;
    if (d.pointerId === null || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (Math.hypot(dx, dy) > 10) d.moved = true;
  };

  const onRootPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    const d = invertTapRef.current;
    if (d.pointerId === null || d.pointerId !== e.pointerId) return;
    d.pointerId = null;
    if (d.moved) return;
    const dt = performance.now() - d.t0;
    if (dt > 420) return;
    setInvert(!isInverted());
  };

  const onRootPointerCancel = (e: React.PointerEvent<HTMLElement>) => {
    const d = invertTapRef.current;
    if (d.pointerId === null || d.pointerId !== e.pointerId) return;
    d.pointerId = null;
    d.moved = false;
  };

  const [lambda, setLambda] = useState(0.45);
  const [beaute, setBeaute] = useState("");
  const [landType, setLandType] = useState<"A" | "B" | "C" | null>(null);
  const lambdaRef = useRef(lambda);
  const beauteRef = useRef(beaute);

  const dirtyRef = useRef<{ lambda: boolean; beaute: boolean }>({ lambda: false, beaute: false });
  const readyRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);
  const needsFlushRef = useRef(false);

  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), NOTE_TTL_MS);
    return () => window.clearTimeout(t);
  }, [note]);

  useEffect(() => {
    let alive = true;
    readyRef.current = false;
    dirtyRef.current = { lambda: false, beaute: false };
    setLoaded(false);
    setNote(null);
    void (async () => {
      const r = await apiLandStateGet();
      if (!alive) return;
      if (r.ok) {
        const lt = r.data.land_type === "A" || r.data.land_type === "B" || r.data.land_type === "C" ? r.data.land_type : null;
        setLandType(lt);
        const l = typeof r.data.lambda === "number" ? clamp01(r.data.lambda) : 0.45;
        const b = typeof r.data.beaute_text === "string" ? r.data.beaute_text : "";
        lambdaRef.current = l;
        beauteRef.current = b;
        setLambda(l);
        setBeaute(b);
        setLoaded(true);
        setNote(null);
        readyRef.current = true;
        return;
      }

      dispatch(r.status === 0 ? "network_error" : "form_validation_error");
      setLoaded(true);
      setNote(r.status === 0 ? "réseau: fragile" : `err:${String((r.data as any)?.error || r.status)}`);
      readyRef.current = true;
    })();
    return () => {
      alive = false;
    };
  }, [dispatch]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  const scheduleSave = () => {
    if (!readyRef.current) return;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void flushSave();
    }, SAVE_DEBOUNCE_MS);
  };

  const flushSave = async () => {
    if (!readyRef.current) return;
    if (inflightRef.current) {
      needsFlushRef.current = true;
      return;
    }

    const payload: { lambda?: number; beaute_text?: string } = {};
    if (dirtyRef.current.lambda) payload.lambda = lambdaRef.current;
    if (dirtyRef.current.beaute) payload.beaute_text = beauteRef.current;
    if (!Object.keys(payload).length) return;

    if (!getCsrf()) {
      setNote("csrf: …");
      void session.api.refresh();
      return;
    }

    setSaving(true);
    setNote("sync: …");
    inflightRef.current = (async () => {
      const r = await apiLandStateSave(payload);
      if (r.ok) {
        dirtyRef.current = { lambda: false, beaute: false };
        setNote("ok");
        return;
      }

      const tag = String((r.data as any)?.error || r.status || "");
      if (r.status === 403 && tag === "csrf") {
        setNote("csrf: …");
        void session.api.refresh();
      } else {
        setNote(r.status === 0 ? "réseau: fragile" : `err:${tag || "http"}`);
      }
      dispatch(r.status === 0 ? "network_error" : "form_validation_error");
    })().finally(() => {
      inflightRef.current = null;
      setSaving(false);
      if (needsFlushRef.current) {
        needsFlushRef.current = false;
        void flushSave();
      }
    });

    await inflightRef.current;
  };

  const setLambdaUser = (next: number) => {
    const v = clamp01(next);
    lambdaRef.current = v;
    setLambda(v);
    dirtyRef.current.lambda = true;
    scheduleSave();
  };

  const onBeauteChange = (next: string) => {
    const t = String(next ?? "");
    beauteRef.current = t;
    setBeaute(t);
    dirtyRef.current.beaute = true;
    scheduleSave();
  };

  const lambdaText = useMemo(() => {
    const v = lambda;
    return `λ ${v.toFixed(3)} · ${lambdaLabel(v)}`;
  }, [lambda]);

  const dragRef = useRef<{ pointerId: number; startX: number; start: number } | null>(null);
  const onLambdaPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return;
    if (!loaded) return;
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, start: lambdaRef.current };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onLambdaPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    const next = d.start + dx / 260;
    setLambdaUser(next);
    e.preventDefault();
  };
  const onLambdaPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (e.pointerId !== d.pointerId) return;
    dragRef.current = null;
    e.preventDefault();
  };

  const onLambdaWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return;
    if (!loaded) return;
    const primary = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    const dir = primary === 0 ? 0 : primary > 0 ? -1 : 1;
    if (!dir) return;
    const step = e.shiftKey ? 0.06 : 0.02;
    setLambdaUser(lambdaRef.current + dir * step);
    e.preventDefault();
  };

  const onLambdaKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return;
    if (!loaded) return;
    const k = String(e.key || "");
    const step = e.shiftKey ? 0.06 : 0.02;
    if (k === "ArrowLeft" || k === "ArrowDown") {
      setLambdaUser(lambdaRef.current - step);
      e.preventDefault();
      return;
    }
    if (k === "ArrowRight" || k === "ArrowUp") {
      setLambdaUser(lambdaRef.current + step);
      e.preventDefault();
      return;
    }
    if (k === "PageDown") {
      setLambdaUser(lambdaRef.current - 0.12);
      e.preventDefault();
      return;
    }
    if (k === "PageUp") {
      setLambdaUser(lambdaRef.current + 0.12);
      e.preventDefault();
      return;
    }
    if (k === "Home") {
      setLambdaUser(0);
      e.preventDefault();
      return;
    }
    if (k === "End") {
      setLambdaUser(1);
      e.preventDefault();
      return;
    }
  };

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    return store.subscribe(() => {
      const m = store.getFrame().nodes.LAND;
      if (!m) return;
      el.style.setProperty("--scale-x", String(m.typo.scaleX.toFixed(3)));
      el.style.setProperty("--scale-y", String(m.typo.scaleY.toFixed(3)));
      el.style.setProperty("--skew", `${m.typo.skewDeg.toFixed(2)}deg`);
      el.style.setProperty("--blur-orient", `${m.blur.orient.toFixed(2)}px`);
      el.style.setProperty("--blur-depth", `${m.blur.depth.toFixed(2)}px`);
      el.style.setProperty("--blur-threshold", `${m.blur.threshold.toFixed(2)}px`);
      el.style.setProperty("--blur-ox", `${m.blur.ox.toFixed(2)}px`);
      el.style.setProperty("--blur-oy", `${m.blur.oy.toFixed(2)}px`);
    });
  }, [store]);

  const onHautHoldStill = () => {
    if (store.getFrame().pointer.speed > 220) return;
    store.toggleDeltaZ();
  };

  const status = note ? note : saving ? "sync: …" : !loaded ? "state: …" : null;

  return (
    <main
      ref={rootRef}
      className="landRoot"
      aria-label="LAND"
      onPointerDown={onRootPointerDown}
      onPointerMove={onRootPointerMove}
      onPointerUp={onRootPointerUp}
      onPointerCancel={onRootPointerCancel}
    >
      <HautPoint href="#/HAUT" label="Haut Point" onHoldStill={onHautHoldStill} />
      <section className="oC3" aria-label="0C3">
        <div className="oC3Title" aria-hidden="true">
          [ 0C3 ]
        </div>

        <div className="oC3Row" aria-label="lambda">
          <span className="oC3Key" aria-hidden="true">
            lambda
          </span>
          <div
            className="oC3Lambda"
            tabIndex={0}
            role="slider"
            aria-label="lambda"
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={Number(lambda.toFixed(3))}
            aria-valuetext={lambdaText}
            onWheel={onLambdaWheel}
            onKeyDown={onLambdaKeyDown}
            onPointerDown={onLambdaPointerDown}
            onPointerMove={onLambdaPointerMove}
            onPointerUp={onLambdaPointerUp}
            onPointerCancel={onLambdaPointerUp}
          >
            {lambdaText}
          </div>
        </div>

        <div className="oC3Row" aria-label="beaute">
          <span className="oC3Key" aria-hidden="true">
            beauté
          </span>
          <textarea
            className="oC3Textarea"
            value={beaute}
            onChange={(e) => onBeauteChange(e.target.value)}
            placeholder="…"
            aria-label="beauté"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>

        {status ? (
          <div className="oC3Status" aria-live={note ? "polite" : "off"}>
            {status}
          </div>
        ) : null}
      </section>
      <QuestDeltaPanel landType={landType} refreshSession={() => void session.api.refresh()} />
    </main>
  );
}
