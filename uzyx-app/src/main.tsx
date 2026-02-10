import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "@/app/App";
import { enforceCanonicalHost } from "@/app/canonical";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app");

const redirected = enforceCanonicalHost({ canonicalCloudHost: "0.user.o.sowwwl.cloud" });
if (!redirected) {
  createRoot(app).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
