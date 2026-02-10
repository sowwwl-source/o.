import React, { useEffect, useMemo, useState } from "react";
import "./adminMagic.css";
import { apiRequest } from "@/api/apiClient";
import { useSession } from "@/api/sessionStore";
import { useOEvent } from "@/oNote/oNote.hooks";

function normalizeEmail(s: string): string {
  const one = String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return one.length > 190 ? one.slice(0, 190) : one;
}

function looksLikeEmail(s: string): boolean {
  const t = normalizeEmail(s);
  if (t.length < 6) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

const NOTE_TTL_MS = 3400;

export function AdminMagicPage() {
  const dispatch = useOEvent();
  const session = useSession();

  useEffect(() => {
    void session.api.refresh();
  }, [session.api]);

  const authedAdmin = session.state.phase === "authed" && Boolean(session.state.me.user.network_admin);
  useEffect(() => {
    if (authedAdmin) window.location.hash = "#/admin/b0ard";
  }, [authedAdmin]);

  const [email, setEmail] = useState(() => localStorage.getItem("sowwwl:admin_email") || "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), NOTE_TTL_MS);
    return () => window.clearTimeout(t);
  }, [note]);

  useEffect(() => {
    try {
      localStorage.setItem("sowwwl:admin_email", email);
    } catch {
      // ignore
    }
  }, [email]);

  const ready = useMemo(() => looksLikeEmail(email), [email]);

  const send = async () => {
    if (busy) return;
    if (!ready) {
      dispatch("form_validation_error");
      setNote("forme: email");
      return;
    }

    setBusy(true);
    setNote("…");
    try {
      const r = await apiRequest("/auth/admin/magic/send", {
        method: "POST",
        json: { email: normalizeEmail(email) },
      });

      if (!r.ok && r.status === 0) {
        dispatch("network_error");
        setNote("réseau: fragile");
        return;
      }

      // Anti-énumération: toujours le même message (même si non-admin / non envoyé).
      setNote("si un lien existe, il part");
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.defaultPrevented) return;
    if (e.key !== "Enter") return;
    e.preventDefault();
    void send();
  };

  return (
    <main className="adminMagicRoot" aria-label="admin magic">
      <header className="adminMagicTop" aria-label="admin header">
        <div className="adminMagicTitle" aria-label="admin">
          admin
        </div>
        <div className="adminMagicMeta" aria-hidden="true">
          {busy ? "…" : session.state.phase === "checking" ? "…" : " "}
        </div>
      </header>

      <section className="adminMagicBlock" aria-label="request link">
        <div className="adminMagicLine" aria-hidden="true">
          /auth/admin/magic
        </div>

        <div className="adminMagicRow">
          <span className="adminMagicKey" aria-hidden="true">
            email
          </span>
          <input
            className="adminMagicInput"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="0wlslw0@…"
            aria-label="email"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="email"
            onKeyDown={onKeyDown}
          />
        </div>

        <div className="adminMagicCmds" aria-label="commands">
          <a
            className="adminMagicCmd"
            href="#"
            aria-label="send"
            data-disabled={!ready || busy ? "1" : "0"}
            aria-disabled={!ready || busy ? "true" : "false"}
            onClick={(e) => {
              e.preventDefault();
              if (busy) return;
              void send();
            }}
          >
            ENVOI
          </a>
          <a className="adminMagicCmd" href="#/" aria-label="close">
            FERME
          </a>
        </div>

        {note ? (
          <div className="adminMagicNote" aria-live="polite">
            {note}
          </div>
        ) : null}

        <div className="adminMagicHint" aria-hidden="true">
          usage unique · 15min · token jamais affiché
        </div>
      </section>
    </main>
  );
}
