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
import { AdminBoardPage } from "@/pages/AdminBoardPage";
import { AdminMagicPage } from "@/pages/AdminMagicPage";
import type { NodeId } from "@/graph/graph";
import { parseRouteFromHash, type Route } from "@/app/routes";
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
import { helmAPI } from "@/helm/helmState";
import "./appShell.css";

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return false;
  return Boolean(t.closest("input,textarea,select,[contenteditable='true']"));
}

function isSwipeBlockedTarget(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return false;
  return Boolean(t.closest("a,button,input,textarea,select,[role='link'],[contenteditable='true']"));
}

type AppPane = "intro" | "menu" | "content";

const APP_PANES: readonly AppPane[] = ["intro", "menu", "content"];
const APP_NODE_LIST: readonly NodeId[] = ["HAUT", "LAND", "FERRY", "STR3M", "CONTACT"];

function clampPaneIndex(n: number): number {
  return Math.max(0, Math.min(APP_PANES.length - 1, n));
}

function paneIndexForNode(id: NodeId): number {
  return id === "HAUT" ? 1 : 2;
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
  if (route.kind === "admin") return 2;
  if (route.kind === "admin_magic") return 2;
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
      // Global UI must remain image-less. Land interior can host media later.
      assertNoImagesInDOM(document, { allowIn: "[data-o-allow-images='true']" });
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
      ) : route.kind === "admin" ? (
        <PerceptionProvider>
          <AdminBoardPage />
        </PerceptionProvider>
      ) : route.kind === "admin_magic" ? (
        <AdminMagicPage />
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

      <ONoteLine muted align={route.kind === "app" || route.kind === "admin" ? "right" : "left"} min_o={min_o} />
      <UzyxImplicitAssist routeKey={route.kind} appNode={route.kind === "app" ? route.id : null} />
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
      <AppSwipeShell id={id} />
    </PerceptionProvider>
  );
}

function AppContentForNode(props: { id: NodeId }) {
  const id = props.id;
  if (id === "HAUT") return <BoardPage active="HAUT" />;
  if (id === "STR3M") return <StreamPage />;
  if (id === "FERRY") return <FerryPage />;
  if (id === "CONTACT") return <ContactsPage />;
  return <LandPage />;
}

function AppSwipeShell(props: { id: NodeId }) {
  const id = props.id;
  const [paneIndex, setPaneIndex] = useState<number>(() => paneIndexForNode(id));
  const swipeRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    startedAt: number;
    canSwipe: boolean;
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startedAt: 0,
    canSwipe: false,
  });

  useEffect(() => {
    setPaneIndex(paneIndexForNode(id));
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (isTypingTarget(e.target)) return;
      if (helmAPI.getState().open) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPaneIndex((n) => clampPaneIndex(n - 1));
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setPaneIndex((n) => clampPaneIndex(n + 1));
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const goToPane = (next: number) => setPaneIndex(clampPaneIndex(next));

  return (
    <div
      className="appShellRoot"
      aria-label="app shell"
      onPointerDown={(e) => {
        if (helmAPI.getState().open) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        swipeRef.current.active = true;
        swipeRef.current.pointerId = e.pointerId;
        swipeRef.current.startX = e.clientX;
        swipeRef.current.startY = e.clientY;
        swipeRef.current.startedAt = performance.now();
        swipeRef.current.canSwipe = !isSwipeBlockedTarget(e.target);
      }}
      onPointerUp={(e) => {
        const s = swipeRef.current;
        if (!s.active || s.pointerId !== e.pointerId) return;
        s.active = false;
        s.pointerId = null;
        if (!s.canSwipe) return;
        if (helmAPI.getState().open) return;
        const dx = e.clientX - s.startX;
        const dy = e.clientY - s.startY;
        const dt = performance.now() - s.startedAt;
        if (dt > 900) return;
        if (Math.abs(dx) < 72) return;
        if (Math.abs(dx) < Math.abs(dy) * 1.25) return;
        if (dx < 0) setPaneIndex((n) => clampPaneIndex(n + 1));
        else setPaneIndex((n) => clampPaneIndex(n - 1));
      }}
      onPointerCancel={() => {
        swipeRef.current.active = false;
        swipeRef.current.pointerId = null;
        swipeRef.current.canSwipe = false;
      }}
    >
      <nav className="appShellTabs" aria-label="shell tabs">
        <a
          className={`appShellTab ${paneIndex === 0 ? "is-active" : ""}`}
          href="#"
          onClick={(e) => {
            e.preventDefault();
            goToPane(0);
          }}
        >
          intro
        </a>
        <a
          className={`appShellTab ${paneIndex === 1 ? "is-active" : ""}`}
          href="#"
          onClick={(e) => {
            e.preventDefault();
            goToPane(1);
          }}
        >
          menu
        </a>
        <a
          className={`appShellTab ${paneIndex === 2 ? "is-active" : ""}`}
          href="#"
          onClick={(e) => {
            e.preventDefault();
            goToPane(2);
          }}
        >
          page
        </a>
      </nav>

      <div
        className="appShellTrack"
        style={
          {
            ["--app-shell-index" as any]: String(paneIndex),
          } as React.CSSProperties
        }
      >
        <section className="appShellPane appShellPaneIntro" aria-label="intro">
          <main className="appIntroRoot">
            <header className="appIntroHead">
              <div className="appIntroTag">sowwwl</div>
              <div className="appIntroMode">vues: 3</div>
            </header>
            <div className="appIntroMatter">
              <h1 className="appIntroTitle">navigation en plans séparés</h1>
              <p className="appIntroCopy">swipe gauche/droite pour passer de intro à menu puis à la page active.</p>
            </div>
            <div className="appIntroCmds" aria-label="intro cmds">
              <a
                className="appIntroCmd"
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  goToPane(1);
                }}
              >
                ouvrir menu
              </a>
              <a
                className="appIntroCmd"
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  goToPane(paneIndexForNode(id));
                }}
              >
                ouvrir page
              </a>
              <a className="appIntroCmd" href="#/entry">
                entry
              </a>
            </div>
            <div className="appIntroHint" aria-hidden="true">
              ←/→ : changer de vue
            </div>
          </main>
        </section>

        <section className="appShellPane appShellPaneMenu" aria-label="menu">
          {paneIndex === 1 ? <BoardPage active={id} /> : null}
          {paneIndex === 1 ? <Molette current={id} /> : null}
          {paneIndex === 1 ? <HelmDock /> : null}
          <nav className="appShellList" aria-label="liste">
            {APP_NODE_LIST.map((node) => (
              <a
                key={node}
                className={`appShellListItem ${id === node ? "is-active" : ""}`}
                href={`#/${node}`}
                onClick={() => setPaneIndex(paneIndexForNode(node))}
              >
                {node}
              </a>
            ))}
          </nav>
        </section>

        <section className="appShellPane appShellPaneContent" aria-label="page">
          {paneIndex === 2 ? <AppContentForNode id={id} /> : null}
        </section>
      </div>
    </div>
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
