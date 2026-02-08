import React, { useEffect, useMemo, useState } from "react";
import "./landNew.css";
import { useSession } from "@/api/sessionStore";
import { apiLandCreate, apiLandGet } from "@/api/apiClient";
import { useONoteFloor } from "@/oNote/useONoteFloor";
import { oNoteStore } from "@/oNote/oNoteStore";

type LandType = "A" | "B" | "C";

export function LandNewPage() {
  useONoteFloor(5);

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
        window.location.hash = "#/app";
        return;
      }
      if (!r.ok) {
        oNoteStore.emit(r.status === 0 ? "network_error" : "form_validation_error", "plain");
      }
    })();
    return () => {
      alive = false;
    };
  }, [session.state.phase]);

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
        oNoteStore.emit("land_created", "short");
        window.location.hash = "#/app";
        return;
      }
      oNoteStore.emit(r.status === 0 ? "network_error" : "form_validation_error", "plain");
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
