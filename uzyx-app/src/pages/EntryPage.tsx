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

function isPasskeySupported(): boolean {
  return typeof window !== "undefined" && "PublicKeyCredential" in window && !!navigator.credentials?.create;
}

function randBytes(n: number): Uint8Array<ArrayBuffer> {
  const a = new Uint8Array(Math.max(1, n | 0));
  crypto.getRandomValues(a);
  return a;
}

function safeBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function createLocalPasskey(label: string): Promise<{ id: string } | null> {
  if (!isPasskeySupported()) return null;
  const userName = normalizeLine(label || "sowwwl", 64) || "sowwwl";

  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: randBytes(32),
    rp: { name: "sowwwl" },
    user: {
      id: randBytes(32),
      name: userName,
      displayName: userName,
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 }, // ES256
      { type: "public-key", alg: -257 }, // RS256
    ],
    timeout: 60_000,
    attestation: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  };

  const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!cred) return null;

  // We keep only a non-sensitive marker (public id) for UX purposes.
  // Server-side registration is out of scope here.
  const rawId = new Uint8Array(cred.rawId);
  return { id: safeBase64Url(rawId) };
}

export function EntryPage() {
  const canPasskey = useMemo(() => isPasskeySupported(), []);
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
    if (!canPasskey) {
      dispatch("auth_passkey_failed");
      return;
    }

    setBusy("passkey");
    try {
      const label = identity || address || "sowwwl";
      const r = await createLocalPasskey(label);
      if (!r) {
        dispatch("auth_passkey_failed");
        return;
      }
      try {
        localStorage.setItem("sowwwl:passkey_id_v1", r.id);
      } catch {}

      dispatch("auth_passkey_success");
    } catch (e: any) {
      const name = String(e?.name || "");
      if (name === "NotAllowedError" || name === "AbortError") {
        dispatch("auth_passkey_cancelled");
      } else {
        dispatch("auth_passkey_failed");
      }
    } finally {
      setBusy(null);
    }
  };

  const onAnchor = async () => {
    if (busy) return;
    const email = normalizeLine(address, 190);
    const rescue = String(code || "");

    if (!looksLikeEmail(email) || !looksLikeRescueCode(rescue)) {
      dispatch("form_validation_error");
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
        if (log.status === 0) dispatch("network_error");
        else dispatch("form_validation_error");
        return;
      }

      if (reg.status === 0) dispatch("network_error");
      else dispatch("form_validation_error");
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
            data-disabled={!canPasskey || busy ? "1" : "0"}
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

        <div className="entryHint" aria-hidden="true">
          pas de jargon · un message à la fois
        </div>
      </section>
    </main>
  );
}
