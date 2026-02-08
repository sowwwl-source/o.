import React, { useEffect } from "react";
import "./anchored.css";
import { useSession } from "@/api/sessionStore";
import { useOEvent } from "@/oNote/oNote.hooks";

export function AnchoredPage() {
  const dispatch = useOEvent();

  const session = useSession();
  useEffect(() => {
    void session.api.refresh();
  }, [session.api]);

  useEffect(() => {
    if (session.state.phase === "guest") window.location.hash = "#/entry";
  }, [session.state.phase]);

  useEffect(() => {
    dispatch("completed_first_run");
  }, [dispatch]);

  return (
    <main className="anchoredRoot" aria-label="anchored">
      <header className="anchoredTop" aria-label="anchored header">
        <div className="anchoredTitle">Ton compte est ancré.</div>
        <div className="anchoredMeta" aria-hidden="true">
          {session.state.phase === "checking" ? "…" : session.state.phase === "authed" ? "ok" : " "}
        </div>
      </header>

      <section className="anchoredEdge" aria-label="next">
        <div className="anchoredLine" aria-hidden="true">
          passage
        </div>
        <div className="anchoredCmds" aria-label="commands">
          <a className="anchoredCmd" href="#/lande/new" aria-label="create land">
            LANDE
          </a>
          <a className="anchoredCmd" href="#/app" aria-label="go to app">
            APP
          </a>
        </div>
      </section>
    </main>
  );
}
