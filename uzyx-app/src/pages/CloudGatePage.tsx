import React, { useEffect, useMemo, useRef, useState } from "react";
import "./cloudGate.css";
import { getDomainEnv } from "@/app/env";
import { apiSoulTokenGet, apiSoulTokenSet, apiSoulUpload, type ApiPayload } from "@/api/apiClient";
import { useSession } from "@/api/sessionStore";
import { useOEvent } from "@/oNote/oNote.hooks";
import { usePerceptionStore } from "@/perception/PerceptionProvider";
import { buildSoulManifest, describeSoulFiles, prepareSoulArchive } from "@/pages/cloudGateUpload";
import { clearPrincipalId, loadPrincipalId, savePrincipalId } from "@/zeroiso/zeroisoPrincipal";
import { assertPublicOnlySeed, cloudNamespace, principalIdFromSshPubkey, zeroisoSeed } from "@/zeroiso/zeroisoSeed";

const NOTE_TTL_MS = 3200;

type UploadReceipt = {
  uploadId: number;
  archiveName: string;
  archiveBytes: number;
  archiveSha256: string;
  storedPath: string;
  manifest: boolean;
  bundled: boolean;
};

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

function apiErrorTag(data: ApiPayload, status: number): string {
  if (typeof data.error === "string" && data.error) return data.error;
  if (typeof data.detail === "string" && data.detail) return data.detail;
  return `http_${status || 0}`;
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = n;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value >= 100 || idx === 0 ? Math.round(value) : value.toFixed(1)} ${units[idx]}`;
}

export function CloudGatePage() {
  const dispatch = useOEvent();
  const session = useSession();
  const store = usePerceptionStore();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    store.setBaseProfile("land");
  }, [store]);

  useEffect(() => {
    void session.api.refresh();
  }, [session.api]);

  useEffect(() => {
    if (session.state.phase === "authed") dispatch("session_restored");
    if (session.state.phase === "error") dispatch("network_error");
  }, [session.state.phase, dispatch]);

  useEffect(() => {
    if (session.state.phase === "guest") window.location.hash = "#/entry";
  }, [session.state.phase]);

  const env = getDomainEnv();
  const require = env.requireSshPrincipal;

  const [sshPub, setSshPub] = useState("");
  const [principalId, setPrincipalId] = useState<string | null>(() => loadPrincipalId());
  const [note, setNote] = useState<string | null>(null);
  const [tokenValue, setTokenValue] = useState("");
  const [tokenHint, setTokenHint] = useState<string | null>(null);
  const [tokenUpdatedAt, setTokenUpdatedAt] = useState<string | null>(null);
  const [manifestNote, setManifestNote] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [receipt, setReceipt] = useState<UploadReceipt | null>(null);
  const [computing, setComputing] = useState(false);
  const [loadingToken, setLoadingToken] = useState(false);
  const [savingToken, setSavingToken] = useState(false);
  const [uploading, setUploading] = useState(false);

  const cloud = useMemo(() => (principalId ? cloudNamespace(principalId) : ""), [principalId]);
  const seed = useMemo(() => (principalId ? zeroisoSeed(principalId, "v1") : ""), [principalId]);
  const describedFiles = useMemo(() => describeSoulFiles(selectedFiles), [selectedFiles]);
  const fileCount = describedFiles.length;
  const totalBytes = useMemo(() => describedFiles.reduce((sum, file) => sum + file.bytes, 0), [describedFiles]);
  const tokenReady = Boolean(tokenHint);
  const authReady = session.state.phase === "authed";
  const busy = computing || loadingToken || savingToken || uploading;
  const email = session.state.phase === "authed" ? session.state.me.user.email : "—";

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), NOTE_TTL_MS);
    return () => window.clearTimeout(t);
  }, [note]);

  useEffect(() => {
    if (!authReady) {
      setTokenHint(null);
      setTokenUpdatedAt(null);
      return;
    }

    let alive = true;
    setLoadingToken(true);
    void (async () => {
      const r = await apiSoulTokenGet();
      if (!alive) return;
      if (!r.ok) {
        const tag = apiErrorTag(r.data, r.status);
        if (r.status === 403 && tag === "csrf") {
          setNote("csrf: …");
          void session.api.refresh();
        } else {
          dispatch(r.status === 0 ? "network_error" : "form_validation_error");
          setNote(r.status === 0 ? "réseau: fragile" : `err:${tag}`);
        }
        setLoadingToken(false);
        return;
      }

      setTokenHint(r.data.token_set ? r.data.token_hint ?? null : null);
      setTokenUpdatedAt(r.data.token_set ? r.data.updated_at ?? null : null);
      setLoadingToken(false);
    })();

    return () => {
      alive = false;
    };
  }, [authReady, dispatch, session.api]);

  const onCompute = async () => {
    setComputing(true);
    try {
      const pid = await principalIdFromSshPubkey(sshPub);
      const nextSeed = zeroisoSeed(pid, "v1");
      assertPublicOnlySeed(nextSeed);
      setPrincipalId(pid);
      savePrincipalId(pid);
      setNote("principal:ok");
    } catch (e: unknown) {
      const detail = e instanceof Error ? e.message : String(e || "invalid");
      setNote(`err:${detail}`);
    } finally {
      setComputing(false);
    }
  };

  const onClear = () => {
    setPrincipalId(null);
    clearPrincipalId();
    setNote("principal:cleared");
  };

  const onCopy = async (kind: "cloud" | "principal" | "seed" | "stored") => {
    const text =
      kind === "cloud" ? cloud : kind === "principal" ? principalId ?? "" : kind === "seed" ? seed : receipt?.storedPath ?? "";
    const ok = await copyText(text);
    setNote(ok ? `copied:${kind}` : "copy:err");
  };

  const onSaveToken = async () => {
    if (!authReady || savingToken) return;

    const token = String(tokenValue || "").trim();
    if (!token) {
      dispatch("form_validation_error");
      setNote("token: requis");
      return;
    }

    setSavingToken(true);
    try {
      const config = principalId ? { principal_id: principalId, cloud } : undefined;
      const r = await apiSoulTokenSet(token, config);
      if (!r.ok) {
        const tag = apiErrorTag(r.data, r.status);
        if (r.status === 403 && tag === "csrf") {
          setNote("csrf: …");
          void session.api.refresh();
        } else {
          dispatch(r.status === 0 ? "network_error" : "form_validation_error");
          setNote(r.status === 0 ? "réseau: fragile" : `err:${tag}`);
        }
        return;
      }

      setTokenHint(r.data.token_hint);
      setTokenUpdatedAt(new Date().toISOString());
      setTokenValue("");
      setNote("token:ok");
    } finally {
      setSavingToken(false);
    }
  };

  const clearFiles = (resetReceipt = true) => {
    setSelectedFiles([]);
    if (resetReceipt) setReceipt(null);
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  };

  const onUpload = async () => {
    if (!authReady || uploading) return;
    if (!tokenReady) {
      dispatch("form_validation_error");
      setNote("token: requis");
      return;
    }
    if (selectedFiles.length === 0) {
      dispatch("form_validation_error");
      setNote("archive: vide");
      return;
    }

    setUploading(true);
    try {
      const prepared = await prepareSoulArchive(selectedFiles);
      const manifest = buildSoulManifest({
        files: selectedFiles,
        note: manifestNote,
        principalId,
        cloud,
        tokenHint,
      });
      const r = await apiSoulUpload(prepared.archive, manifest);
      if (!r.ok) {
        const tag = apiErrorTag(r.data, r.status);
        if (r.status === 403 && tag === "csrf") {
          setNote("csrf: …");
          void session.api.refresh();
        } else {
          dispatch(r.status === 0 ? "network_error" : "form_validation_error");
          setNote(
            tag === "token_required"
              ? "token: requis"
              : r.status === 0
                ? "réseau: fragile"
                : `err:${tag}`
          );
        }
        return;
      }

      setReceipt({
        uploadId: r.data.upload_id,
        archiveName: r.data.archive.name,
        archiveBytes: r.data.archive.bytes,
        archiveSha256: r.data.archive.sha256,
        storedPath: r.data.stored.path,
        manifest: r.data.stored.manifest,
        bundled: prepared.bundled,
      });
      setManifestNote("");
      clearFiles(false);
      setNote(prepared.bundled ? `bundle:${prepared.files.length}` : "zip:ok");
    } catch (e: unknown) {
      const detail = e instanceof Error ? e.message : String(e || "upload_failed");
      dispatch("network_error");
      setNote(`err:${detail}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="cloudGateRoot" aria-label="cloud gate">
      <header className="cloudGateTop">
        <div className="cloudGateTitle" aria-label="CLOUD">
          soul.cloud
        </div>
        <div className="cloudGateMeta" aria-hidden="true">
          {env.host || "—"} · {require ? "ssh:required" : "ssh:optional"} · {authReady ? email : session.state.phase} · {busy ? "…" : "stable"}
        </div>
      </header>

      <section className="cloudGateLayout" aria-label="cloud layout">
        <section className="cloudGateBlock" aria-label="gate">
          <div className="cloudGateLine" aria-hidden="true">
            IMPORT SSH PUBLIC KEY
          </div>
          {!principalId ? (
            <>
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
                  data-disabled={!sshPub || computing ? "1" : "0"}
                  onClick={(e) => {
                    e.preventDefault();
                    if (!sshPub || computing) return;
                    void onCompute();
                  }}
                >
                  COMPUTE PRINCIPAL
                </a>
                <a
                  className="cloudGateCmd"
                  href="#"
                  aria-label="clear principal"
                  data-disabled={computing ? "1" : "0"}
                  onClick={(e) => {
                    e.preventDefault();
                    if (computing) return;
                    onClear();
                  }}
                >
                  CLEAR
                </a>
              </div>
            </>
          ) : (
            <>
              <div className="cloudGateGrid" aria-label="identifiers">
                <div className="cloudGateRow">
                  <span className="cloudGateKey">principal_id</span>
                  <span className="cloudGateVal">{principalId}</span>
                </div>
                <div className="cloudGateRow">
                  <span className="cloudGateKey">cloud</span>
                  <span className="cloudGateVal">{cloud || "—"}</span>
                </div>
                <div className="cloudGateRow">
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
            </>
          )}
        </section>

        <section className="cloudGateBlock" aria-label="soul token panel">
          <div className="cloudGateLine" aria-hidden="true">
            SOUL TOKEN
          </div>
          <div className="cloudGateGrid" aria-label="token status">
            <div className="cloudGateRow">
              <span className="cloudGateKey">session</span>
              <span className="cloudGateVal">{authReady ? email : session.state.phase}</span>
            </div>
            <div className="cloudGateRow">
              <span className="cloudGateKey">token</span>
              <span className="cloudGateVal">{tokenHint || "not_set"}</span>
            </div>
            <div className="cloudGateRow">
              <span className="cloudGateKey">updated</span>
              <span className="cloudGateVal">{tokenUpdatedAt ? tokenUpdatedAt.replace("T", " ").replace("Z", " utc") : "—"}</span>
            </div>
          </div>
          <input
            className="cloudGateInput"
            aria-label="soul token"
            value={tokenValue}
            onChange={(e) => setTokenValue(e.target.value)}
            placeholder="token soul.cloud"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          <div className="cloudGateHint" aria-hidden="true">
            le token n’est jamais réaffiché, seulement un indice
          </div>
          <div className="cloudGateCmds" aria-label="token commands">
            <a
              className="cloudGateCmd"
              href="#"
              aria-label="save soul token"
              data-disabled={!authReady || !tokenValue.trim() || savingToken ? "1" : "0"}
              onClick={(e) => {
                e.preventDefault();
                if (!authReady || !tokenValue.trim() || savingToken) return;
                void onSaveToken();
              }}
            >
              SAVE TOKEN
            </a>
          </div>
        </section>

        <section className="cloudGateBlock cloudGateSpan2" aria-label="upload panel">
          <div className="cloudGateLine" aria-hidden="true">
            SEND MANY THINGS
          </div>
          <div className="cloudGateBody">
            <div className="cloudGateUploadTop">
              <label className="cloudGatePicker">
                <span className="cloudGatePickerTitle">select files</span>
                <input
                  ref={uploadInputRef}
                  className="cloudGateFileInput"
                  type="file"
                  aria-label="files to send"
                  multiple
                  onChange={(e) => {
                    setSelectedFiles(Array.from(e.target.files || []));
                    setReceipt(null);
                  }}
                />
              </label>
              <div className="cloudGateUploadMeta" aria-hidden="true">
                {fileCount} file{fileCount > 1 ? "s" : ""} · {formatBytes(totalBytes)} · {fileCount === 1 && /\.zip$/i.test(selectedFiles[0]?.name || "") ? "direct zip" : "bundle zip"}
              </div>
            </div>

            <textarea
              className="cloudGateTextarea cloudGateTextareaCompact"
              aria-label="manifest note"
              value={manifestNote}
              onChange={(e) => setManifestNote(e.target.value)}
              placeholder="note de lot, contexte, titre, source…"
              autoCorrect="off"
              spellCheck={false}
            />

            {describedFiles.length ? (
              <div className="cloudGateFiles" aria-label="selected files">
                {describedFiles.map((file) => (
                  <div key={`${file.path}:${file.bytes}`} className="cloudGateFileItem">
                    <span className="cloudGateFileName">{file.path}</span>
                    <span className="cloudGateFileMeta">{formatBytes(file.bytes)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="cloudGateHint" aria-hidden="true">
                plusieurs fichiers seront empaquetés en un seul zip avant l’envoi
              </div>
            )}

            <div className="cloudGateCmds" aria-label="upload commands">
              <a
                className="cloudGateCmd"
                href="#"
                aria-label="upload archive"
                data-disabled={!authReady || !tokenReady || fileCount === 0 || uploading ? "1" : "0"}
                onClick={(e) => {
                  e.preventDefault();
                  if (!authReady || !tokenReady || fileCount === 0 || uploading) return;
                  void onUpload();
                }}
              >
                UPLOAD
              </a>
              <a
                className="cloudGateCmd"
                href="#"
                aria-label="clear files"
                data-disabled={fileCount === 0 || uploading ? "1" : "0"}
                onClick={(e) => {
                  e.preventDefault();
                  if (fileCount === 0 || uploading) return;
                  clearFiles();
                }}
              >
                CLEAR FILES
              </a>
            </div>

            {receipt ? (
              <div className="cloudGateReceipt" aria-label="upload receipt">
                <div className="cloudGateRow">
                  <span className="cloudGateKey">upload_id</span>
                  <span className="cloudGateVal">{receipt.uploadId}</span>
                </div>
                <div className="cloudGateRow">
                  <span className="cloudGateKey">archive</span>
                  <span className="cloudGateVal">
                    {receipt.archiveName} · {formatBytes(receipt.archiveBytes)} · {receipt.bundled ? "bundled" : "direct"}
                  </span>
                </div>
                <div className="cloudGateRow">
                  <span className="cloudGateKey">sha256</span>
                  <span className="cloudGateVal">{receipt.archiveSha256}</span>
                </div>
                <div className="cloudGateRow">
                  <span className="cloudGateKey">stored</span>
                  <span className="cloudGateVal">{receipt.storedPath}</span>
                </div>
                <div className="cloudGateCmds" aria-label="receipt commands">
                  <a
                    className="cloudGateCmd"
                    href="#"
                    aria-label="copy stored path"
                    data-disabled={!receipt.storedPath ? "1" : "0"}
                    onClick={(e) => {
                      e.preventDefault();
                      if (!receipt.storedPath) return;
                      void onCopy("stored");
                    }}
                  >
                    COPY PATH
                  </a>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </section>

      <section className="cloudGateBlock" aria-label="terminal guide">
        <div className="cloudGateLine" aria-hidden="true">
          GENERATE KEY (terminal guide)
        </div>
        <pre className="cloudGatePre" aria-label="terminal">
          ssh-keygen -t ed25519 -C "sowwwl"
          {"\n"}cat ~/.ssh/id_ed25519.pub
        </pre>
        <div className="cloudGateHint" aria-hidden="true">
          never paste a private key · route requires an authenticated session for upload
        </div>
        {note ? (
          <div className="cloudGateNote" aria-live="polite">
            {note}
          </div>
        ) : null}
      </section>
    </main>
  );
}
