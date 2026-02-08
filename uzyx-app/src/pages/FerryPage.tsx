import React, { useEffect, useMemo, useRef, useState } from "react";
import "../ferry/ferry.css";
import { FerrySession, getLastFerryCode, shortCode, type FerryState } from "../ferry/ferrySession";
import { contactsStore } from "../contacts/contactsStore";
import { HautPoint } from "@/components/HautPoint";
import { usePerceptionStore } from "@/perception/PerceptionProvider";

const EMPTY: FerryState = {
  code: null,
  status: "idle",
  participants: [],
  invites: [],
  me: "me",
};

function isInteractiveTarget(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return false;
  return Boolean(t.closest("a,button,input,textarea,select"));
}

export function FerryPage() {
  const store = usePerceptionStore();
  const sessionRef = useRef<FerrySession | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<FerryState>(EMPTY);
  const [codeInput, setCodeInput] = useState(() => getLastFerryCode() || "");
  const [destination, setDestination] = useState("delta");

  useEffect(() => {
    store.setBaseProfile("ferry");
  }, [store]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    return store.subscribe(() => {
      const m = store.getFrame().nodes.FERRY;
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

  useEffect(() => {
    const s = new FerrySession();
    sessionRef.current = s;
    setState(s.getState());
    const onUpdate = (e: Event) => setState((e as CustomEvent<FerryState>).detail);
    s.addEventListener("update", onUpdate);
    return () => {
      s.removeEventListener("update", onUpdate);
      s.leave();
      s.dispose();
    };
  }, []);

  // Keyboard: ESC leaves the ferry (no button).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key !== "Escape") return;
      if (isInteractiveTarget(e.target)) return;
      if (state.status === "idle") return;
      e.preventDefault();
      sessionRef.current?.leave();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, true);
  }, [state.status]);

  const pulses = useMemo(() => {
    const n = state.participants.length;
    return Math.max(1, Math.min(6, n));
  }, [state.participants.length]);

  const create = () => {
    const code = shortCode();
    setCodeInput(code);
    sessionRef.current?.create(code);
  };

  const join = (code: string) => sessionRef.current?.join(code.trim().toUpperCase());
  const setDest = () => sessionRef.current?.setDestination(destination.trim());
  const board = () => sessionRef.current?.board();

  const contacts = useMemo(() => contactsStore.list().slice(0, 8), [state.code, state.invites.length]);

  const onCodeKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const v = codeInput.trim().toUpperCase();
    if (e.ctrlKey || e.metaKey) return create();
    if (!v) return create();
    join(v);
  };

  const onDestKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    setDest();
  };

  const onTitleHoldStill = () => {
    if (store.getFrame().pointer.speed > 220) return;
    if (state.status === "lobby") board();
  };

  const onHautHoldStill = () => {
    if (store.getFrame().pointer.speed > 220) return;
    store.toggleDeltaZ();
  };

  return (
    <main ref={rootRef} className="ferryRoot" aria-label="FERRY">
      <HautPoint href="#/HAUT" label="Haut Point" onHoldStill={onHautHoldStill} />

      <header className="ferryTop">
        <div className="ferryTitle" tabIndex={0} aria-label="FERRY" onPointerDown={(e) => e.stopPropagation()}>
          <span className="ferryTitleMatter">FERRY</span>
        </div>
        <div className="ferryMeta">{state.code ? `code ${state.code}` : "aucun ferry"}</div>
      </header>

      {state.status === "idle" ? (
        <section className="ferryLines" aria-label="lobby">
          <div className="ferryLine">
            <span className="ferryKey">code</span>
            <input
              className="ferryInput"
              aria-label="code ferry"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={onCodeKeyDown}
              placeholder="XXXX"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        </section>
      ) : (
        <>
          <section className="ferryLines" aria-label="participants">
            <div className="ferryPresence" aria-label="presence">
              {Array.from({ length: pulses }).map((_, i) => (
                <span key={i} className="pulse" aria-hidden="true" />
              ))}
              <span className="ferryCount" aria-hidden="true">
                {state.participants.length}
              </span>
              <span className="ferryMeta ferrySmall" aria-hidden="true">
                {state.status}
              </span>
            </div>

            <ul className="ferryList" aria-label="participants list">
              {state.participants.map((p) => (
                <li key={p} className="ferryUser">
                  {p}
                </li>
              ))}
            </ul>
          </section>

          <section className="ferryLines" aria-label="route">
            <div className="ferryLine">
              <span className="ferryKey">dest</span>
              <input
                className="ferryInput"
                aria-label="destination"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                onKeyDown={onDestKeyDown}
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          </section>

          {contacts.length > 0 ? (
            <section className="ferryLines" aria-label="invite">
              <div className="ferryLine">
                <span className="ferryKey">invite</span>
                {contacts.map((c) => (
                  <InviteToken key={c.id} id={c.id} onInvite={() => sessionRef.current?.invite(c.id)} />
                ))}
              </div>
            </section>
          ) : null}

          {state.invites.length > 0 ? (
            <section className="ferryLines" aria-label="invites received">
              <div className="ferryLine">
                <span className="ferryKey">recu</span>
                {state.invites.slice(0, 8).map((id) => (
                  <span key={id} className="ferryMeta ferrySmall">
                    {id}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      {/* Intention: hold the title (still) to trigger traversal. No explicit UI. */}
      <FerryTitleHold onHoldStill={onTitleHoldStill} />
    </main>
  );
}

function InviteToken(props: { id: string; onInvite: () => void }) {
  const { id, onInvite } = props;
  const holdRef = useRef<{ t: number | null; fired: boolean; x: number; y: number; pid: number | null }>({ t: null, fired: false, x: 0, y: 0, pid: null });

  const clear = (opts?: { resetFired?: boolean }) => {
    if (holdRef.current.t !== null) window.clearTimeout(holdRef.current.t);
    holdRef.current.t = null;
    holdRef.current.pid = null;
    if (opts?.resetFired) holdRef.current.fired = false;
  };

  useEffect(() => () => clear({ resetFired: true }), []);

  const startHold = () => {
    clear();
    holdRef.current.fired = false;
    holdRef.current.t = window.setTimeout(() => {
      holdRef.current.t = null;
      holdRef.current.fired = true;
      onInvite();
    }, 520);
  };

  const onPointerDown: React.PointerEventHandler<HTMLSpanElement> = (e) => {
    if (e.button !== 0) return;
    holdRef.current.pid = e.pointerId;
    holdRef.current.x = e.clientX;
    holdRef.current.y = e.clientY;
    startHold();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const onPointerMove: React.PointerEventHandler<HTMLSpanElement> = (e) => {
    if (holdRef.current.t === null) return;
    if (holdRef.current.pid !== e.pointerId) return;
    if (Math.hypot(e.clientX - holdRef.current.x, e.clientY - holdRef.current.y) > 10) clear({ resetFired: true });
  };

  const onPointerUp = () => clear({ resetFired: true });
  const onPointerCancel = () => clear({ resetFired: true });

  const onKeyDown: React.KeyboardEventHandler<HTMLSpanElement> = (e) => {
    if (e.repeat) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    startHold();
  };

  const onKeyUp: React.KeyboardEventHandler<HTMLSpanElement> = (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    clear({ resetFired: true });
  };

  const onClick: React.MouseEventHandler<HTMLSpanElement> = (e) => {
    if (!holdRef.current.fired) return;
    e.preventDefault();
    e.stopPropagation();
    holdRef.current.fired = false;
  };

  return (
    <span
      className="ferryToken"
      tabIndex={0}
      aria-label={`invite ${id}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onClick={onClick}
    >
      <span className="ferryDot" aria-hidden="true" />
      <span className="ferryTokenId">{id}</span>
    </span>
  );
}

function FerryTitleHold(props: { onHoldStill: () => void }) {
  const { onHoldStill } = props;
  const ref = useRef<HTMLDivElement | null>(null);
  const hold = useRef<{ t: number | null; x: number; y: number }>({ t: null, x: 0, y: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const clear = () => {
      if (hold.current.t !== null) window.clearTimeout(hold.current.t);
      hold.current.t = null;
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      hold.current.x = e.clientX;
      hold.current.y = e.clientY;
      clear();
      hold.current.t = window.setTimeout(() => {
        clear();
        onHoldStill();
      }, 720);
    };

    const onMove = (e: PointerEvent) => {
      if (hold.current.t === null) return;
      if (Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > 10) clear();
    };

    const onUp = () => clear();

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      clear();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [onHoldStill]);

  return <div ref={ref} className="ferryTitleHold" aria-hidden="true" />;
}
