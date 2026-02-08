import React, { useEffect } from "react";
import "./home.css";
import { useONoteFloor } from "@/oNote/useONoteFloor";
import { oNoteStore } from "@/oNote/oNoteStore";
import { useSession } from "@/api/sessionStore";

export function HomePage() {
  useONoteFloor(0);

  const session = useSession();
  useEffect(() => {
    void session.api.refresh();
  }, [session.api]);

  useEffect(() => {
    if (session.state.phase === "authed") oNoteStore.emit("session_restored", "short");
  }, [session.state.phase]);

  return (
    <main className="homeRoot" aria-label="home">
      <header className="homeTop" aria-label="sowwwl">
        <div className="homeTitle">sowwwl</div>
        <div className="homeMeta" aria-hidden="true">
          {session.state.phase === "checking" ? "…" : session.state.phase === "authed" ? "session:ok" : " "}
        </div>
      </header>

      <section className="homeEdge" aria-label="entry">
        <div className="homeLine" aria-hidden="true">
          . O.
        </div>
        <div className="homeCmds" aria-label="commands">
          <a className="homeCmd" href="#/entry" aria-label="entry">
            ENTRY
          </a>
          <a className="homeCmd" href="#/app" aria-label="app">
            APP
          </a>
        </div>
        <div className="homeHint" aria-hidden="true">
          inversion: i
        </div>
      </section>
    </main>
  );
}

