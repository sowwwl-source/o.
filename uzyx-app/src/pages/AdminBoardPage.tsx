import React, { useEffect, useMemo, useState } from "react";
import "./adminBoard.css";
import { apiAuthLogout, apiQu3stGet, apiQu3stSave, type ApiPayload } from "@/api/apiClient";
import { useSession } from "@/api/sessionStore";
import { useOEvent } from "@/oNote/oNote.hooks";

const NOTE_TTL_MS = 3200;

function apiErrorTag(data: ApiPayload, status: number): string {
  if (typeof data.error === "string" && data.error) return data.error;
  if (typeof data.detail === "string" && data.detail) return data.detail;
  return `http_${status || 0}`;
}

function normalizeContent(s: string): string {
  return String(s || "").replace(/\r\n/g, "\n");
}

export function AdminBoardPage() {
  const dispatch = useOEvent();
  const session = useSession();

  const [content, setContent] = useState("");
  const [baseline, setBaseline] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "load" | "save" | "logout">(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void session.api.refresh();
  }, [session.api]);

  useEffect(() => {
    const h = String(window.location.hash || "");
    if (h === "#/admin" || h === "#/admin/") window.location.hash = "#/admin/b0ard";
  }, []);

  useEffect(() => {
    if (session.state.phase === "authed") dispatch("session_restored");
    if (session.state.phase === "error") dispatch("network_error");
  }, [session.state.phase, dispatch]);

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), NOTE_TTL_MS);
    return () => window.clearTimeout(t);
  }, [note]);

  const isAdmin = session.state.phase === "authed" && Boolean(session.state.me.user.network_admin);
  const adminMe = session.state.phase === "authed" && session.state.me.user.network_admin ? session.state.me : null;

  useEffect(() => {
    if (session.state.phase === "guest") window.location.hash = "#/admin/magic";
    if (session.state.phase === "authed" && !isAdmin) window.location.hash = "#/app/HAUT";
  }, [session.state.phase, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    setBusy("load");
    void (async () => {
      const r = await apiQu3stGet();
      if (!alive) return;
      if (!r.ok) {
        dispatch(r.status === 0 ? "network_error" : "form_validation_error");
        setNote(r.status === 0 ? "réseau: fragile" : `err:${apiErrorTag(r.data, r.status)}`);
        setBusy(null);
        return;
      }
      const next = normalizeContent(r.data.qu3st.content);
      setContent(next);
      setBaseline(next);
      setUpdatedAt(r.data.qu3st.updated_at ?? null);
      setBusy(null);
    })();
    return () => {
      alive = false;
    };
  }, [dispatch, isAdmin]);

  const dirty = useMemo(() => content !== baseline, [content, baseline]);
  const charCount = useMemo(() => content.length, [content]);

  const reload = async () => {
    if (!isAdmin || busy) return;
    setBusy("load");
    try {
      const r = await apiQu3stGet();
      if (!r.ok) {
        dispatch(r.status === 0 ? "network_error" : "form_validation_error");
        setNote(r.status === 0 ? "réseau: fragile" : `err:${apiErrorTag(r.data, r.status)}`);
        return;
      }
      const next = normalizeContent(r.data.qu3st.content);
      setContent(next);
      setBaseline(next);
      setUpdatedAt(r.data.qu3st.updated_at ?? null);
      setNote("chargé");
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!isAdmin || busy) return;
    setBusy("save");
    try {
      const r = await apiQu3stSave(content);
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
      setBaseline(content);
      setUpdatedAt(new Date().toISOString());
      setNote("sauvé");
    } finally {
      setBusy(null);
    }
  };

  const logout = async () => {
    if (busy) return;
    setBusy("logout");
    try {
      await apiAuthLogout();
      session.api.setGuest();
      window.location.hash = "#/admin/magic";
    } finally {
      setBusy(null);
    }
  };

  if (session.state.phase === "unknown" || session.state.phase === "checking") {
    return (
      <main className="adminBoardRoot" aria-label="admin gate">
        <div className="adminBoardStatus">…</div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="adminBoardRoot" aria-label="admin blocked">
        <div className="adminBoardStatus">—</div>
      </main>
    );
  }

  const email = adminMe?.user.email ?? "—";

  return (
    <main className="adminBoardRoot" aria-label="admin console">
      <header className="adminBoardTop" aria-label="admin top">
        <div className="adminBoardTitleBlock">
          <div className="adminBoardTitle">admin console</div>
          <div className="adminBoardMeta">{email}</div>
        </div>
        <div className="adminBoardStatus" aria-live="polite">
          {note ?? (busy ? "…" : dirty ? "draft" : "stable")}
        </div>
      </header>

      <section className="adminBoardGrid" aria-label="admin layout">
        <aside className="adminBoardRail" aria-label="admin commands">
          <div className="adminBoardBlock">
            <div className="adminBoardBlockTitle">session</div>
            <div className="adminBoardRow">
              <span className="adminBoardKey">admin</span>
              <span className="adminBoardVal">ok</span>
            </div>
            <div className="adminBoardRow">
              <span className="adminBoardKey">updated</span>
              <span className="adminBoardVal">{updatedAt ? updatedAt.replace("T", " ").replace("Z", " utc") : "—"}</span>
            </div>
            <div className="adminBoardRow">
              <span className="adminBoardKey">chars</span>
              <span className="adminBoardVal">{charCount}</span>
            </div>
          </div>

          <div className="adminBoardBlock">
            <div className="adminBoardBlockTitle">commands</div>
            <div className="adminBoardCmds">
              <a
                className="adminBoardCmd"
                href="#"
                aria-label="save qu3st"
                data-disabled={busy || !dirty ? "1" : "0"}
                onClick={(e) => {
                  e.preventDefault();
                  if (busy || !dirty) return;
                  void save();
                }}
              >
                SAVE
              </a>
              <a
                className="adminBoardCmd"
                href="#"
                aria-label="reload qu3st"
                data-disabled={busy ? "1" : "0"}
                onClick={(e) => {
                  e.preventDefault();
                  if (busy) return;
                  void reload();
                }}
              >
                RELOAD
              </a>
              <a className="adminBoardCmd" href="#/admin/magic" aria-label="magic links">
                MAGIC
              </a>
              <a className="adminBoardCmd" href="#/app/HAUT" aria-label="back to app">
                APP
              </a>
              <a
                className="adminBoardCmd"
                href="#"
                aria-label="logout admin"
                data-disabled={busy ? "1" : "0"}
                onClick={(e) => {
                  e.preventDefault();
                  if (busy) return;
                  void logout();
                }}
              >
                LOGOUT
              </a>
            </div>
          </div>
        </aside>

        <section className="adminBoardEditor" aria-label="qu3st editor">
          <div className="adminBoardBlockTitle">qu3st</div>
          <textarea
            className="adminBoardTextarea"
            value={content}
            onChange={(e) => setContent(normalizeContent(e.target.value))}
            aria-label="qu3st content"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="none"
            placeholder="qu3st"
            onKeyDown={(e) => {
              if (e.defaultPrevented) return;
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                if (!busy && dirty) void save();
              }
            }}
          />
          <div className="adminBoardHint" aria-hidden="true">
            ctrl/cmd+s · accès gardé par le backend · console réservée à l’admin réseau
          </div>
        </section>
      </section>
    </main>
  );
}
