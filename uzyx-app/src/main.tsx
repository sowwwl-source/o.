import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "@/app/App";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app");

createRoot(app).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
