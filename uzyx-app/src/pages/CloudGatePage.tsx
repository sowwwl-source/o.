import React, { useEffect, useMemo, useState } from "react";
import "./cloudGate.css";
import { getDomainEnv } from "@/app/env";
import { assertPublicOnlySeed, cloudNamespace, principalIdFromSshPubkey, zeroisoSeed } from "@/zeroiso/zeroisoSeed";
import { clearPrincipalId, loadPrincipalId, savePrincipalId } from "@/zeroiso/zeroisoPrincipal";
import { usePerceptionStore } from "@/perception/PerceptionProvider";

async function copyText(text: string): Promise<boolean> {
  const t = String(text || "");
  if (!t) return false;
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export function CloudGatePage() {
  const store = usePerceptionStore();
  useEffect(() => {
    store.setBaseProfile("land");
  }, [store]);

  const env = getDomainEnv();
  const require = env.requireSshPrincipal;

  const [sshPub, setSshPub] = useState("");
  const [principalId, setPrincipalId] = useState<string | null>(() => loadPrincipalId());
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cloud = useMemo(() => (principalId ? cloudNamespace(principalId) : ""), [principalId]);
  const seed = useMemo(() => (principalId ? zeroisoSeed(principalId, "v1") : ""), [principalId]);

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), 1900);
    return () => window.clearTimeout(t);
  }, [note]);

  const onCompute = async () => {
    setBusy(true);
    try {
      const pid = await principalIdFromSshPubkey(sshPub);
      const s = zeroisoSeed(pid, "v1");
      assertPublicOnlySeed(s);
      setPrincipalId(pid);
      savePrincipalId(pid);
      setNote("principal:ok");
    } catch (e: any) {
      setNote(`err:${String(e?.message || e || "invalid")}`);
    } finally {
      setBusy(false);
    }
  };

  const onClear = () => {
    setPrincipalId(null);
    clearPrincipalId();
    setNote("principal:cleared");
  };

  const onCopy = async (kind: "cloud" | "principal" | "seed") => {
    const text = kind === "cloud" ? cloud : kind === "principal" ? principalId ?? "" : seed;
    const ok = await copyText(text);
    setNote(ok ? `copied:${kind}` : "copy:err");
  };

  return (
    <main className="cloudGateRoot" aria-label="cloud gate">
      <header className="cloudGateTop">
        <div className="cloudGateTitle" aria-label="CLOUD">
          soul.cloud
        </div>
        <div className="cloudGateMeta" aria-hidden="true">
          {env.host || "—"} · {require ? "ssh:required" : "ssh:optional"} · {busy ? "…" : " "}
        </div>
      </header>

      {!principalId ? (
        <section className="cloudGateBlock" aria-label="gate">
          <div className="cloudGateLine" aria-hidden="true">
            IMPORT SSH PUBLIC KEY
          </div>
          <textarea
            className="cloudGateTextarea"
            aria-label="ssh public key"
            value={sshPub}
            onChange={(e) => setSshPub(e.target.value)}
            placeholder="ssh-ed25519 AAAA…"
            autoCorrect="off"
            spellCheck={false}
          />
          <div className="cloudGateCmds" aria-label="commands">
            <a
              className="cloudGateCmd"
              href="#"
              aria-label="compute principal"
              data-disabled={!sshPub || busy ? "1" : "0"}
              onClick={(e) => {
                e.preventDefault();
                if (!sshPub || busy) return;
                void onCompute();
              }}
            >
              COMPUTE PRINCIPAL
            </a>
            <a
              className="cloudGateCmd"
              href="#"
              aria-label="clear principal"
              data-disabled={busy ? "1" : "0"}
              onClick={(e) => {
                e.preventDefault();
                if (busy) return;
                onClear();
              }}
            >
              CLEAR
            </a>
          </div>
        </section>
      ) : (
        <section className="cloudGateBlock" aria-label="linked">
          <div className="cloudGateGrid" aria-label="identifiers">
            <div className="cloudGateRow" aria-hidden="true">
              <span className="cloudGateKey">principal_id</span>
              <span className="cloudGateVal">{principalId ?? "—"}</span>
            </div>
            <div className="cloudGateRow" aria-hidden="true">
              <span className="cloudGateKey">cloud</span>
              <span className="cloudGateVal">{cloud || "—"}</span>
            </div>
            <div className="cloudGateRow" aria-hidden="true">
              <span className="cloudGateKey">0isO_seed</span>
              <span className="cloudGateVal">{seed || "—"}</span>
            </div>
          </div>
          <div className="cloudGateCmds" aria-label="commands">
            <a
              className="cloudGateCmd"
              href="#"
              aria-label="copy cloud namespace"
              data-disabled={!cloud || busy ? "1" : "0"}
              onClick={(e) => {
                e.preventDefault();
                if (!cloud || busy) return;
                void onCopy("cloud");
              }}
            >
              COPY CLOUD
            </a>
            <a
              className="cloudGateCmd"
              href="#"
              aria-label="copy principal id"
              data-disabled={!principalId || busy ? "1" : "0"}
              onClick={(e) => {
                e.preventDefault();
                if (!principalId || busy) return;
                void onCopy("principal");
              }}
            >
              COPY PRINCIPAL
            </a>
            <a
              className="cloudGateCmd"
              href="#"
              aria-label="copy 0isO seed"
              data-disabled={!seed || busy ? "1" : "0"}
              onClick={(e) => {
                e.preventDefault();
                if (!seed || busy) return;
                void onCopy("seed");
              }}
            >
              COPY SEED
            </a>
            <a
              className="cloudGateCmd"
              href="#"
              aria-label="clear principal"
              data-disabled={busy ? "1" : "0"}
              onClick={(e) => {
                e.preventDefault();
                if (busy) return;
                onClear();
              }}
            >
              CLEAR
            </a>
          </div>
        </section>
      )}

      <section className="cloudGateBlock" aria-label="terminal guide">
        <div className="cloudGateLine" aria-hidden="true">
          GENERATE KEY (terminal guide)
        </div>
        <pre className="cloudGatePre" aria-label="terminal">
          ssh-keygen -t ed25519 -C "sowwwl"
          {"\n"}cat ~/.ssh/id_ed25519.pub
        </pre>
        <div className="cloudGateHint" aria-hidden="true">
          never paste a private key
        </div>
        {note ? (
          <div className="cloudGateNote" aria-hidden="true">
            {note}
          </div>
        ) : null}
      </section>
    </main>
  );
}
