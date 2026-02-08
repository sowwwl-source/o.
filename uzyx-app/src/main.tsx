import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { applyTokens, TOKENS } from "./tokens";
import { BoardPage } from "./board/BoardPage";
import { StreamPage } from "./stream/StreamPage";
import { FerryPage } from "./ferry/FerryPage";
import { ContactsPage } from "./contacts/ContactsPage";

applyTokens(TOKENS);

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app");

function useHashRoute() {
  const [route, setRoute] = useState(() => window.location.hash || "#/board");
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash || "#/board");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route.replace("#", "");
}

function App() {
  const route = useHashRoute();
  if (route.startsWith("/stream")) return <StreamPage />;
  if (route.startsWith("/ferry")) return <FerryPage />;
  if (route.startsWith("/contacts")) return <ContactsPage />;
  return <BoardPage />;
}

createRoot(app).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
