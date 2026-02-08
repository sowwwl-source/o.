import React, { useEffect, useMemo, useState } from "react";
import "./entry.css";
import { useSession } from "@/api/sessionStore";
import { apiAuthLogin, apiAuthRegister } from "@/api/apiClient";
import { useOEvent } from "@/oNote/oNote.hooks";

function normalizeLine(s: string, max = 96): string {
  const one = String(s || "")
    .replace(/\s+/g, " ")
    .trim();
  return one.length > max ? one.slice(0, max) : one;
}

function looksLikeEmail(s: string): boolean {
  const t = normalizeLine(s, 220);
  if (t.length < 6) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function looksLikeRescueCode(s: string): boolean {
  return String(s || "").length >= 8;
}

const NOTE_TTL_MS = 2400;

function normalizeErrTag(x: unknown): string {
  const raw = String(x || "").trim();
  if (!raw) return "err";
  return raw.length > 64 ? raw.slice(0, 64) : raw;
}

export function EntryPage() {
  const dispatch = useOEvent();

  const session = useSession();
  useEffect(() => {
    void session.api.refresh();
  }, [session.api]);

  useEffect(() => {
    if (session.state.phase !== "authed") return;
    dispatch("session_restored");
    window.location.hash = "#/app";
  }, [session.state.phase, dispatch]);

  const [identity, setIdentity] = useState(() => localStorage.getItem("sowwwl:identity_public") || "");
  const [address, setAddress] = useState(() => localStorage.getItem("sowwwl:identity_address") || "");
  const [code, setCode] = useState("");

  const [busy, setBusy] = useState<null | "passkey" | "anchor">(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), NOTE_TTL_MS);
    return () => window.clearTimeout(t);
  }, [note]);

  useEffect(() => {
    try {
      localStorage.setItem("sowwwl:identity_public", identity);
      localStorage.setItem("sowwwl:identity_address", address);
    } catch {
      // ignore
    }
  }, [identity, address]);

  const anchorReady = useMemo(() => looksLikeEmail(address) && looksLikeRescueCode(code), [address, code]);

  const onPasskey = async () => {
    if (busy) return;
    // Guardrail: do not fake a server session with a local-only passkey marker.
    // PASSKEY is visible, but only becomes active once backend WebAuthn is deployed.
    dispatch("auth_passkey_failed");
    setNote("passkey: pas ici");
  };

  const onAnchor = async () => {
    if (busy) return;
    const email = normalizeLine(address, 190);
    const rescue = String(code || "");

    if (!looksLikeEmail(email) || !looksLikeRescueCode(rescue)) {
      dispatch("form_validation_error");
      setNote("forme: incomplète");
      return;
    }

    setBusy("anchor");
    try {
      const reg = await apiAuthRegister(email, rescue);
      if (reg.ok) {
        await session.api.refresh();
        window.location.hash = "#/anchored";
        return;
      }

      // No signup/login jargon: one action tries both.
      const err = reg.data?.error;
      if (reg.status === 409 || err === "email_exists") {
        const log = await apiAuthLogin(email, rescue);
        if (log.ok) {
          await session.api.refresh();
          window.location.hash = "#/anchored";
          return;
        }
        if (log.status === 0) {
          dispatch("network_error");
          setNote("réseau: fragile");
        } else {
          dispatch("form_validation_error");
          setNote(`forme: ${normalizeErrTag(log.data?.error)}`);
        }
        return;
      }

      if (reg.status === 0) {
        dispatch("network_error");
        setNote("réseau: fragile");
      } else {
        dispatch("form_validation_error");
        setNote(`forme: ${normalizeErrTag(reg.data?.error)}`);
      }
    } finally {
      setBusy(null);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.defaultPrevented) return;
    if (e.key !== "Enter") return;
    if (busy) return;
    e.preventDefault();
    void onAnchor();
  };

  return (
    <main className="entryRoot" aria-label="entry">
      <header className="entryTop" aria-label="entry header">
        <div className="entryTitle" aria-label="Mais qui es-tu ?">
          Mais qui es-tu ?
        </div>
        <div className="entryMeta" aria-hidden="true">
          {busy ? "…" : session.state.phase === "checking" ? "…" : " "}
        </div>
      </header>

      <section className="entryBlock" aria-label="identity">
        <div className="entryRow">
          <span className="entryKey" aria-hidden="true">
            identité publique
          </span>
          <input
            className="entryInput"
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
            placeholder="nom…"
            aria-label="identité publique"
            autoCorrect="off"
            spellCheck={false}
            onKeyDown={onKey}
          />
        </div>

        <div className="entryRow">
          <span className="entryKey" aria-hidden="true">
            adresse (secours)
          </span>
          <input
            className="entryInput"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="adresse…"
            aria-label="adresse secours"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="email"
            onKeyDown={onKey}
          />
        </div>

        <div className="entryRow">
          <span className="entryKey" aria-hidden="true">
            code (secours)
          </span>
          <input
            className="entryInput"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="8+"
            aria-label="code de secours"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            type="password"
            onKeyDown={onKey}
          />
        </div>

        <div className="entryCmds" aria-label="commands">
          <a
            className="entryCmd"
            href="#"
            aria-label="create passkey"
            data-disabled="1"
            aria-disabled="true"
            onClick={(e) => {
              e.preventDefault();
              if (busy) return;
              void onPasskey();
            }}
          >
            PASSKEY
          </a>
          <a
            className="entryCmd"
            href="#"
            aria-label="anchor"
            data-disabled={!anchorReady || busy ? "1" : "0"}
            onClick={(e) => {
              e.preventDefault();
              if (busy) return;
              void onAnchor();
            }}
          >
            ANCRER
          </a>
        </div>

        {note ? (
          <div className="entryErr" aria-live="polite">
            {note}
          </div>
        ) : null}

        <div className="entryHint" aria-hidden="true">
          pas de jargon · un message à la fois
        </div>
      </section>
    </main>
  );
}
