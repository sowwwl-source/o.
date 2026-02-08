import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { BoardPage } from "./pages/BoardPage";
import type { NodeId } from "@/graph/graph";

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

  useEffect(() => {
    const onHash = () => setActive(parseNodeFromHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return <BoardPage active={active} />;
}

createRoot(app).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
