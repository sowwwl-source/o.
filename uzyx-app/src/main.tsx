import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { BoardPage } from "./pages/BoardPage";
import { ContactsPage } from "./pages/ContactsPage";
import { FerryPage } from "./pages/FerryPage";
import { LandPage } from "./pages/LandPage";
import { ProfilePage } from "./pages/ProfilePage";
import { StreamPage } from "./pages/StreamPage";
import type { NodeId } from "@/graph/graph";
import { PerceptionProvider } from "@/perception/PerceptionProvider";
import { Molette } from "@/components/Molette";
import { useUzyxSignals } from "@/uzyx/useUzyxSignals";
import { useUzyxFailSafe } from "@/uzyx/useUzyxFailSafe";
import { UzyxImplicitAssist } from "@/uzyx/UzyxImplicitAssist";
import { assertBicolorVars, assertNoImagesInDOM } from "@/guardrails/oRules";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app");

type Route =
  | { kind: "node"; id: NodeId }
  | { kind: "profile"; handle: string };

function parseRouteFromHash(hash: string): Route {
  const raw = String(hash || "").replace(/^#\/?/, "").replace(/^\/+/, "");
  const parts = raw.split("/").filter(Boolean);
  const head = (parts[0] ?? "").toLowerCase();
  if (head === "u" && parts[1]) {
    const handle = decodeURIComponent(parts[1]).replace(/^@+/, "");
    return { kind: "profile", handle };
  }

  const key = raw.trim().toUpperCase();
  if (key === "" || key === "HAUT" || key === "B0ARD" || key === "BOARD") return { kind: "node", id: "HAUT" };
  if (key === "LAND") return { kind: "node", id: "LAND" };
  if (key === "FERRY") return { kind: "node", id: "FERRY" };
  if (key === "STR3M" || key === "STR3AM" || key === "STREAM") return { kind: "node", id: "STR3M" };
  if (key === "CONTACT" || key === "CONTACTS") return { kind: "node", id: "CONTACT" };
  return { kind: "node", id: "HAUT" };
}

function App() {
  const [route, setRoute] = useState<Route>(() => parseRouteFromHash(window.location.hash));

  useUzyxSignals();
  useUzyxFailSafe();

  useEffect(() => {
    const onHash = () => setRoute(parseRouteFromHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    queueMicrotask(() => {
      assertBicolorVars();
      assertNoImagesInDOM(document);
    });
  }, []);

  const nodeForMolette: NodeId = route.kind === "node" ? route.id : "HAUT";

  return (
    <PerceptionProvider>
      {route.kind === "profile" ? (
        <ProfilePage handle={route.handle} />
      ) : route.id === "HAUT" ? (
        <BoardPage active="HAUT" />
      ) : route.id === "STR3M" ? (
        <StreamPage />
      ) : route.id === "FERRY" ? (
        <FerryPage />
      ) : route.id === "CONTACT" ? (
        <ContactsPage />
      ) : (
        <LandPage />
      )}
      <Molette current={nodeForMolette} />
      <UzyxImplicitAssist />
    </PerceptionProvider>
  );
}

createRoot(app).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
