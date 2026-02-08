import React, { useEffect, useMemo, useState } from "react";
import "./landNew.css";
import { useSession } from "@/api/sessionStore";
import { apiLandCreate, apiLandGet, getCsrf } from "@/api/apiClient";
import { useOEvent } from "@/oNote/oNote.hooks";
import { useONoteAPI } from "@/oNote/oNote.store";

type LandType = "A" | "B" | "C";

const NOTE_TTL_MS = 2400;

export function LandNewPage() {
  const dispatch = useOEvent();
  const { setContext } = useONoteAPI();

  const session = useSession();
  const [busy, setBusy] = useState<LandType | null>(null);
  const [landReady, setLandReady] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), NOTE_TTL_MS);
    return () => window.clearTimeout(t);
  }, [note]);

  useEffect(() => {
    void session.api.refresh();
  }, [session.api]);

  useEffect(() => {
    if (session.state.phase === "guest") window.location.hash = "#/entry";
  }, [session.state.phase]);

  useEffect(() => {
    setLandReady(false);
    if (session.state.phase !== "authed") return;
    let alive = true;
    void (async () => {
      const r = await apiLandGet();
      if (!alive) return;
      if (r.ok && r.data.created) {
        setContext({ hasLand: true });
        window.location.hash = "#/app";
        return;
      }
      if (!r.ok) {
        dispatch(r.status === 0 ? "network_error" : "form_validation_error");
        setNote(r.status === 0 ? "réseau: fragile" : `err:${String((r.data as any)?.error || r.status)}`);
        return;
      }
      setLandReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [session.state.phase, dispatch, setContext]);

  const choices = useMemo(
    () =>
      [
        { id: "A" as const, label: "A", hint: "stable" },
        { id: "B" as const, label: "B", hint: "souple" },
        { id: "C" as const, label: "C", hint: "dense" },
      ] as const,
    []
  );

  const onPick = async (t: LandType) => {
    if (busy) return;
    if (session.state.phase !== "authed") {
      setNote("session: …");
      return;
    }
    if (!landReady) {
      setNote("lande: …");
      return;
    }
    if (!getCsrf()) {
      // Avoid a 403 csrf from fast taps; wait until /me has hydrated csrf.
      setNote("csrf: …");
      void session.api.refresh();
      return;
    }
    setBusy(t);
    try {
      const r = await apiLandCreate(t);
      if (r.ok) {
        setContext({ hasLand: true });
        dispatch("land_created");
        window.location.hash = "#/app";
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
    } finally {
      setBusy(null);
    }
  };

  const disabled = busy || session.state.phase !== "authed" || !landReady || !getCsrf();

  const status = note
    ? note
    : session.state.phase === "checking" || session.state.phase === "unknown"
      ? "session: …"
      : session.state.phase !== "authed"
        ? "—"
        : !landReady
          ? "lande: …"
          : !getCsrf()
            ? "csrf: …"
            : null;

  return (
    <main className="landNewRoot" aria-label="lande new">
      <header className="landNewTop" aria-label="lande header">
        <div className="landNewTitle">Ta Lande n’existe pas encore.</div>
        <div className="landNewMeta" aria-hidden="true">
          {busy ? "…" : " "}
        </div>
      </header>

      <section className="landNewEdge" aria-label="create">
        <div className="landNewLine" aria-hidden="true">
          lande/new
        </div>

        <div className="landNewCmds" aria-label="choices">
          {choices.map((c) => (
            <a
              key={c.id}
              className="landNewCmd"
              href="#"
              aria-label={`create land ${c.id}`}
              data-disabled={disabled ? "1" : "0"}
              aria-disabled={disabled ? "true" : "false"}
              onClick={(e) => {
                e.preventDefault();
                if (disabled) return;
                void onPick(c.id);
              }}
            >
              {c.label}
              <span className="landNewHint" aria-hidden="true">
                {c.hint}
              </span>
            </a>
          ))}
        </div>

        {status ? (
          <div className="landNewStatus" aria-live={note ? "polite" : "off"}>
            {status}
          </div>
        ) : null}
      </section>
    </main>
  );
}
