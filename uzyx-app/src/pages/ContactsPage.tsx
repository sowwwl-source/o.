import React, { useEffect, useMemo, useRef, useState } from "react";
import "../contacts/contacts.css";
import { contactsStore, type Contact } from "../contacts/contactsStore";
import { emitInvite, getLastFerryCode } from "../ferry/ferrySession";
import { HautPoint } from "@/components/HautPoint";
import { usePerceptionStore } from "@/perception/PerceptionProvider";

export function ContactsPage() {
  const store = usePerceptionStore();
  const rootRef = useRef<HTMLElement | null>(null);
  const [id, setId] = useState("");
  const [note, setNote] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    store.setBaseProfile("land");
  }, [store]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    return store.subscribe(() => {
      const m = store.getFrame().nodes.CONTACT;
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

  const contacts = useMemo(() => {
    const list = contactsStore.list();
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }, [tick]);

  const onAdd = () => {
    const nextId = id.trim();
    if (!nextId) return;
    const c: Contact = { id: nextId.toUpperCase(), note: note.trim() || undefined, createdAt: Date.now() };
    contactsStore.add(c);
    setId("");
    setNote("");
    setTick((t) => t + 1);
  };

  const onRemove = (contactId: string) => {
    contactsStore.remove(contactId);
    setTick((t) => t + 1);
  };

  const ferryCode = getLastFerryCode();

  const onHautHoldStill = () => {
    if (store.getFrame().pointer.speed > 220) return;
    store.toggleDeltaZ();
  };

  const onAddKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    onAdd();
  };

  return (
    <main ref={rootRef} className="contactsRoot" aria-label="1n1tc(o)ntact">
      <HautPoint href="#/HAUT" label="Haut Point" onHoldStill={onHautHoldStill} />

      <header className="contactsTop">
        <div className="contactsTitle" aria-label="1n1tc(o)ntact">
          <span className="contactsTitleMatter">1n1tc(o)ntact</span>
        </div>
        <div className="contactsMeta">{ferryCode ? `ferry ${ferryCode}` : "ferry —"}</div>
      </header>

      <section aria-label="add">
        <div className="contactsLine">
          <span className="contactsKey">id</span>
          <input
            className="contactsInput"
            aria-label="contact id"
            value={id}
            onChange={(e) => setId(e.target.value)}
            onKeyDown={onAddKeyDown}
            placeholder="HANDLE"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
          <span className="contactsKey">note</span>
          <input
            className="contactsInput"
            aria-label="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={onAddKeyDown}
            placeholder="optionnel"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
      </section>

      <section aria-label="list">
        <ul className="contactsList">
          {contacts.map((c) => (
            <ContactRow key={c.id} contact={c} onRemove={() => onRemove(c.id)} />
          ))}
        </ul>
      </section>
    </main>
  );
}

function ContactRow(props: { contact: Contact; onRemove: () => void }) {
  const { contact, onRemove } = props;
  const [primed, setPrimed] = useState(false);
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
      emitInvite(contact.id);
      setPrimed(true);
      window.setTimeout(() => setPrimed(false), 220);
    }, 580);
  };

  const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (e.button !== 0) return;
    holdRef.current.pid = e.pointerId;
    holdRef.current.x = e.clientX;
    holdRef.current.y = e.clientY;
    startHold();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (holdRef.current.t === null) return;
    if (holdRef.current.pid !== e.pointerId) return;
    if (Math.hypot(e.clientX - holdRef.current.x, e.clientY - holdRef.current.y) > 10) clear({ resetFired: true });
  };

  const onPointerUp = () => clear({ resetFired: true });
  const onPointerCancel = () => clear({ resetFired: true });

  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.repeat) return;
    if (e.key === "Backspace") {
      e.preventDefault();
      onRemove();
      return;
    }
    if (e.key !== "Enter" && e.key !== " ") return;
    startHold();
  };

  const onKeyUp: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    clear({ resetFired: true });
  };

  const onClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!holdRef.current.fired) return;
    e.preventDefault();
    e.stopPropagation();
    holdRef.current.fired = false;
  };

  return (
    <li className="contactRow">
      <div
        className={`contactToken ${primed ? "contactPrimed" : ""}`}
        aria-label={`contact ${contact.id}`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onClick={onClick}
      >
        <span className="contactDot" aria-hidden="true" />
        <span className="contactId">{contact.id}</span>
        {contact.note ? <span className="contactNote">{contact.note}</span> : null}
      </div>
    </li>
  );
}
