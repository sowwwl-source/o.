import React, { useEffect } from "react";
import { BoardPage } from "@/pages/BoardPage";
import { useSession } from "@/api/sessionStore";
import { useOEvent } from "@/oNote/oNote.hooks";
import { Molette } from "@/components/Molette";
import { HelmDock } from "@/uzyx/HelmDock";

export function AdminBoardPage() {
  const dispatch = useOEvent();
  const session = useSession();

  useEffect(() => {
    void session.api.refresh();
  }, [session.api]);

  useEffect(() => {
    if (session.state.phase === "authed") dispatch("session_restored");
    if (session.state.phase === "error") dispatch("network_error");
  }, [session.state.phase, dispatch]);

  const isAdmin = session.state.phase === "authed" && Boolean(session.state.me.user.network_admin);

  useEffect(() => {
    if (session.state.phase === "guest") window.location.hash = "#/";
    if (session.state.phase === "authed" && !isAdmin) window.location.hash = "#/app/HAUT";
  }, [session.state.phase, isAdmin]);

  if (session.state.phase === "unknown" || session.state.phase === "checking") {
    return (
      <main
        aria-label="admin gate"
        style={{
          minHeight: "100vh",
          padding: "calc(var(--space-xl) + env(safe-area-inset-top, 0px))",
          letterSpacing: "0.14em",
          opacity: 0.66,
        }}
      >
        …
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main
        aria-label="admin blocked"
        style={{
          minHeight: "100vh",
          padding: "calc(var(--space-xl) + env(safe-area-inset-top, 0px))",
          letterSpacing: "0.14em",
          opacity: 0.66,
        }}
      >
        —
      </main>
    );
  }

  return (
    <>
      <BoardPage active="HAUT" />
      <Molette current="HAUT" />
      <HelmDock />
    </>
  );
}

