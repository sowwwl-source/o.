import React, { useEffect, useMemo, useState } from "react";
import "./landNew.css";
import { useSession } from "@/api/sessionStore";
import { apiLandCreate, apiLandGet } from "@/api/apiClient";
import { useOEvent } from "@/oNote/oNote.hooks";
import { useONoteAPI } from "@/oNote/oNote.store";

type LandType = "A" | "B" | "C";

export function LandNewPage() {
  const dispatch = useOEvent();
  const { setContext } = useONoteAPI();

  const session = useSession();
  const [busy, setBusy] = useState<LandType | null>(null);

  useEffect(() => {
    void session.api.refresh();
  }, [session.api]);

  useEffect(() => {
    if (session.state.phase === "guest") window.location.hash = "#/entry";
  }, [session.state.phase]);

  useEffect(() => {
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
      }
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
    setBusy(t);
    try {
      const r = await apiLandCreate(t);
      if (r.ok) {
        setContext({ hasLand: true });
        dispatch("land_created");
        window.location.hash = "#/app";
        return;
      }
      dispatch(r.status === 0 ? "network_error" : "form_validation_error");
    } finally {
      setBusy(null);
    }
  };

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
              data-disabled={busy ? "1" : "0"}
              onClick={(e) => {
                e.preventDefault();
                if (busy) return;
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
      </section>
    </main>
  );
}
