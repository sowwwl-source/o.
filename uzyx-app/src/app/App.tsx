import React, { useEffect, useRef, useState } from "react";
import { BoardPage } from "@/pages/BoardPage";
import { HomePage } from "@/pages/HomePage";
import { EntryPage } from "@/pages/EntryPage";
import { AnchoredPage } from "@/pages/AnchoredPage";
import { LandNewPage } from "@/pages/LandNewPage";
import { ContactsPage } from "@/pages/ContactsPage";
import { FerryPage } from "@/pages/FerryPage";
import { LandPage } from "@/pages/LandPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { StreamPage } from "@/pages/StreamPage";
import { CloudGatePage } from "@/pages/CloudGatePage";
import type { NodeId } from "@/graph/graph";
import { PerceptionProvider } from "@/perception/PerceptionProvider";
import { Molette } from "@/components/Molette";
import { useUzyxSignals } from "@/uzyx/useUzyxSignals";
import { useUzyxFailSafe } from "@/uzyx/useUzyxFailSafe";
import { UzyxImplicitAssist } from "@/uzyx/UzyxImplicitAssist";
import { assertBicolorVars } from "@/guards/bicolor";
import { assertNoImagesInDOM } from "@/guards/noImages";
import { useSession } from "@/api/sessionStore";
import { ONoteLine } from "@/components/ONoteLine";
import { toggleThemeInverse } from "@/theme/useThemeToggle";
import { ONoteProvider, useONoteAPI } from "@/oNote/oNote.store";
import type { OScore } from "@/oNote/oNote.types";
import { useOEvent } from "@/oNote/oNote.hooks";
import { HelmDock } from "@/uzyx/HelmDock";
import { apiLandGet } from "@/api/apiClient";
import { apiLandThemeGet } from "@/api/apiClient";
import { applyLandTheme, clearLandTheme } from "@/theme/landTheme";
import { installShakeSignal } from "@/theme/shakeSignal";

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return false;
  return Boolean(t.closest("input,textarea,select,[contenteditable='true']"));
}

type Route =
  | { kind: "home" }
  | { kind: "entry" }
  | { kind: "anchored" }
  | { kind: "lande_new" }
  | { kind: "app"; id: NodeId }
  | { kind: "profile"; handle: string }
  | { kind: "cloud" };

function parseRouteFromHash(hash: string): Route {
  const raw = String(hash || "").replace(/^#\/?/, "").replace(/^\/+/, "");
  const parts = raw.split("/").filter(Boolean);
  const head = (parts[0] ?? "").toLowerCase();

  if (raw.trim() === "") return { kind: "home" };
  if (head === "entry") return { kind: "entry" };
  if (head === "anchored") return { kind: "anchored" };
  if (head === "lande" && (parts[1] ?? "").toLowerCase() === "new") return { kind: "lande_new" };

  if (head === "u" && parts[1]) {
    const handle = decodeURIComponent(parts[1]).replace(/^@+/, "");
    return { kind: "profile", handle };
  }

  if (head === "cloud" || head === "soul" || head === "soul.cloud") return { kind: "cloud" };

  if (head === "app") {
    const k2 = String(parts[1] ?? "").trim().toUpperCase();
    if (k2 === "" || k2 === "HAUT" || k2 === "B0ARD" || k2 === "BOARD") return { kind: "app", id: "HAUT" };
    if (k2 === "LAND") return { kind: "app", id: "LAND" };
    if (k2 === "FERRY") return { kind: "app", id: "FERRY" };
    if (k2 === "STR3M" || k2 === "STR3AM" || k2 === "STREAM") return { kind: "app", id: "STR3M" };
    if (k2 === "CONTACT" || k2 === "CONTACTS") return { kind: "app", id: "CONTACT" };
    return { kind: "app", id: "HAUT" };
  }

  // Back-compat: node ids at the root are treated as "/app/<node>".
  const key = raw.trim().toUpperCase();
  if (key === "HAUT" || key === "B0ARD" || key === "BOARD") return { kind: "app", id: "HAUT" };
  if (key === "LAND") return { kind: "app", id: "LAND" };
  if (key === "FERRY") return { kind: "app", id: "FERRY" };
  if (key === "STR3M" || key === "STR3AM" || key === "STREAM") return { kind: "app", id: "STR3M" };
  if (key === "CONTACT" || key === "CONTACTS") return { kind: "app", id: "CONTACT" };
  return { kind: "home" };
}

function isPasskeySupported(): boolean {
  return typeof window !== "undefined" && "PublicKeyCredential" in window && !!navigator.credentials?.create;
}

function minOForRoute(route: Route): OScore {
  if (route.kind === "home") return 0;
  // Passkeys must never "fake" a server session. Until backend WebAuthn is deployed,
  // keep entry in identity mode (min 7).
  if (route.kind === "entry") return 7;
  if (route.kind === "anchored") return 4;
  if (route.kind === "lande_new") return 5;
  if (route.kind === "app") return route.id === "LAND" ? 6 : route.id === "FERRY" ? 4 : route.id === "CONTACT" ? 4 : route.id === "STR3M" ? 3 : 2;
  return 0;
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRouteFromHash(window.location.hash));
  const min_o = minOForRoute(route);

  useUzyxSignals();
  useUzyxFailSafe();

  useEffect(() => installShakeSignal(), []);

  useEffect(() => {
    const onHash = () => setRoute(parseRouteFromHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Global inversion: must exist everywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const k = String(e.key || "").toLowerCase();
      if (k !== "i") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      toggleThemeInverse();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    queueMicrotask(() => {
      assertBicolorVars();
      assertNoImagesInDOM(document);
    });
  }, []);

  return (
    <ONoteProvider>
      {route.kind === "home" ? (
        <HomePage />
      ) : route.kind === "entry" ? (
        <EntryPage />
      ) : route.kind === "anchored" ? (
        <AnchoredPage />
      ) : route.kind === "lande_new" ? (
        <LandNewPage />
      ) : route.kind === "profile" ? (
        <PerceptionProvider>
          <ProfilePage handle={route.handle} />
        </PerceptionProvider>
      ) : route.kind === "cloud" ? (
        <PerceptionProvider>
          <CloudGatePage />
        </PerceptionProvider>
      ) : (
        <AppGate id={route.id} />
      )}

      <ONoteLine muted align={route.kind === "app" ? "right" : "left"} min_o={min_o} />
      <UzyxImplicitAssist />
      <ONoteContextBridge />
      <LandThemeHydrator />
    </ONoteProvider>
  );
}

function AppGate(props: { id: NodeId }) {
  const id = props.id;
  const dispatch = useOEvent();
  const { setContext } = useONoteAPI();

  const session = useSession();
  const [landCreated, setLandCreated] = useState<boolean | null>(null);

  useEffect(() => {
    void session.api.refresh();
  }, [session.api]);

  useEffect(() => {
    if (session.state.phase === "guest") window.location.hash = "#/entry";
  }, [session.state.phase]);

  useEffect(() => {
    if (session.state.phase !== "error") return;
    dispatch("network_error");
  }, [session.state.phase, dispatch]);

  useEffect(() => {
    if (session.state.phase !== "authed") {
      setLandCreated(null);
      setContext({ hasLand: false });
      return;
    }
    let alive = true;
    void (async () => {
      const r = await apiLandGet();
      if (!alive) return;
      if (r.ok) {
        const created = Boolean(r.data.created);
        setLandCreated(created);
        setContext({ hasLand: created });
        if (!created) window.location.hash = "#/lande/new";
        return;
      }
      // If we cannot resolve land state, stay conservative: route to lande/new.
      dispatch(r.status === 0 ? "network_error" : "form_validation_error");
      window.location.hash = "#/lande/new";
    })();
    return () => {
      alive = false;
    };
  }, [session.state.phase, dispatch, setContext]);

  if (session.state.phase === "checking" || session.state.phase === "unknown") {
    return (
      <main
        aria-label="app gate"
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

  if (session.state.phase !== "authed") {
    return (
      <main
        aria-label="app gate blocked"
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

  if (landCreated !== true) {
    // Land check is in-flight (or about to redirect).
    return (
      <main
        aria-label="app gate land"
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

  return (
    <PerceptionProvider>
      {id === "HAUT" ? (
        <BoardPage active="HAUT" />
      ) : id === "STR3M" ? (
        <StreamPage />
      ) : id === "FERRY" ? (
        <FerryPage />
      ) : id === "CONTACT" ? (
        <ContactsPage />
      ) : (
        <LandPage />
      )}
      <Molette current={id} />
      <HelmDock />
    </PerceptionProvider>
  );
}

function ONoteContextBridge() {
  const session = useSession();
  const { setContext } = useONoteAPI();

  useEffect(() => {
    const hasSession = session.state.phase === "authed";
    setContext({ hasSession });
  }, [session.state.phase, setContext]);

  return null;
}

function LandThemeHydrator() {
  const session = useSession();
  const lastUidRef = useRef<number | null>(null);

  const phase = session.state.phase;
  const uid = phase === "authed" ? session.state.me.user.id : null;

  useEffect(() => {
    if (phase !== "authed" || uid === null) {
      lastUidRef.current = null;
      clearLandTheme();
      return;
    }
    if (lastUidRef.current === uid) return;
    lastUidRef.current = uid;

    let alive = true;
    void (async () => {
      const r = await apiLandThemeGet();
      if (!alive) return;
      if (r.ok) applyLandTheme(r.data.theme);
    })();

    return () => {
      alive = false;
    };
  }, [phase, uid]);

  return null;
}
