import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { BoardPage } from "./pages/BoardPage";
import { ContactsPage } from "./pages/ContactsPage";
import { FerryPage } from "./pages/FerryPage";
import { LandPage } from "./pages/LandPage";
import { StreamPage } from "./pages/StreamPage";
import type { NodeId } from "@/graph/graph";
import { PerceptionProvider } from "@/perception/PerceptionProvider";
import { Molette } from "@/components/Molette";
import { useUzyxSignals } from "@/uzyx/useUzyxSignals";
import { useUzyxFailSafeGuard } from "@/uzyx/useUzyxFailSafeGuard";
import { UzyxImplicitAssist } from "@/uzyx/UzyxImplicitAssist";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app");

function parseNodeFromHash(hash: string): NodeId {
  const raw = String(hash || "").replace(/^#\/?/, "").replace(/^\/+/, "");
  const key = raw.trim().toUpperCase();
  if (key === "" || key === "HAUT" || key === "B0ARD" || key === "BOARD") return "HAUT";
  if (key === "LAND") return "LAND";
  if (key === "FERRY") return "FERRY";
  if (key === "STR3M" || key === "STR3AM" || key === "STREAM") return "STR3M";
  if (key === "CONTACT" || key === "CONTACTS") return "CONTACT";
  return "HAUT";
}

function App() {
  const [active, setActive] = useState<NodeId>(() => parseNodeFromHash(window.location.hash));

  useUzyxSignals();
  useUzyxFailSafeGuard();

  useEffect(() => {
    const onHash = () => setActive(parseNodeFromHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <PerceptionProvider>
      {active === "HAUT" ? (
        <BoardPage active="HAUT" />
      ) : active === "STR3M" ? (
        <StreamPage />
      ) : active === "FERRY" ? (
        <FerryPage />
      ) : active === "CONTACT" ? (
        <ContactsPage />
      ) : (
        <LandPage />
      )}
      <Molette current={active} />
      <UzyxImplicitAssist />
    </PerceptionProvider>
  );
}

createRoot(app).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
