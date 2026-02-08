import React, { useEffect, useMemo, useRef, useState } from "react";
import "./ferry.css";
import { FerrySession, shortCode, type FerryState } from "./ferrySession";
import { listContacts } from "../contacts/contactsStore";

export function FerryPage() {
  const sessionRef = useRef<FerrySession | null>(null);
  const [state, setState] = useState<FerryState>({
    code: null,
    status: "idle",
    participants: [],
    me: "me",
  });
  const [codeInput, setCodeInput] = useState("");
  const [destination, setDestination] = useState("delta");
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    const s = new FerrySession();
    sessionRef.current = s;
    setState(s.getState());
    const onUpdate = (e: Event) => {
      const next = (e as CustomEvent<FerryState>).detail;
      setState(next);
    };
    s.addEventListener("update", onUpdate);
    return () => s.removeEventListener("update", onUpdate);
  }, []);

  const pulses = useMemo(() => {
    const n = state.participants.length;
    return Math.max(1, Math.min(6, n));
  }, [state.participants.length]);

  const startCreate = () => {
    const code = shortCode();
    sessionRef.current?.create(code);
  };
  const startJoin = () => {
    sessionRef.current?.join(codeInput.trim().toUpperCase());
  };
  const leave = () => sessionRef.current?.leave();
  const board = () => sessionRef.current?.board();
  const setDest = () => sessionRef.current?.setDestination(destination);
  const contacts = useMemo(() => listContacts(), [state.code, inviteOpen]);

  return (
    <main className={`ferry ${state.status === "boarding" ? "is-boarding" : ""}`}>
      <section className="ferryHeader">
        <div className="ferryTitle">FERRY</div>
        <div className="ferryMeta">
          {state.code ? `code ${state.code}` : "aucun ferry"}
        </div>
      </section>

      {state.status === "idle" ? (
        <section className="ferryPanel">
          <div className="row">
            <button className="btn" onClick={startCreate}>
              creer
            </button>
            <input
              className="ferryInput"
              aria-label="code ferry"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="code"
            />
            <button className="btn" onClick={startJoin}>
              rejoindre
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="ferryPanel">
            <div className="ferryPresence" aria-label="presence">
              {Array.from({ length: pulses }).map((_, i) => (
                <span key={i} className="pulse" />
              ))}
              <span className="ferryCount">{state.participants.length}</span>
            </div>
            <div className="ferryList">
              {state.participants.map((p) => (
                <div key={p} className="ferryUser">
                  {p}
                </div>
              ))}
            </div>
          </section>

          <section className="ferryPanel">
            <div className="row">
              <input
                className="ferryInput"
                aria-label="destination"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              />
              <button className="btn" onClick={setDest}>
                fixer
              </button>
              <button className="btn" onClick={board}>
                embarquer
              </button>
              <button className="btn" onClick={() => setInviteOpen((v) => !v)}>
                inviter
              </button>
              <button className="btn" onClick={leave}>
                quitter
              </button>
            </div>
          </section>

          {inviteOpen ? (
            <section className="ferryPanel">
              <div className="ferryInvite">
                {contacts.length === 0 ? (
                  <div className="ferryMeta">aucun contact</div>
                ) : (
                  contacts.map((c) => (
                    <button key={c.id} className="btn">
                      {c.handle}
                    </button>
                  ))
                )}
              </div>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
