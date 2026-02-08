import React, { useEffect, useMemo, useRef, useState } from "react";
import "./zeroiso.css";
import {
  buildZeroisoFrames,
  defaultZeroisoConfig,
  densityFromImageFile,
  parseFragmentsInput,
} from "./zeroisoEngine";
import { exportZeroisoGif } from "./zeroisoExportGif";
import { normalizeHandle, seedFromHandle, seedFromSshPublicKey } from "./zeroisoSeed";
import type { DensityGrid, ZeroisoBuildResult, ZeroisoScanSlot } from "./types";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function isReducedMotion(): boolean {
  const m = typeof window !== "undefined" ? window.matchMedia?.("(prefers-reduced-motion: reduce)") : null;
  return Boolean(m?.matches);
}

function microShift(text: string, seed: string, tick: number): string {
  const lines = String(text || "").split("\n");
  if (!lines.length) return text;
  const w = Math.max(0, ...lines.map((l) => l.length));
  const t = tick + (seed.length % 13);

  const maxShift = 4;
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").padEnd(w, " ");
    const s = Math.sin(t * 0.27 + i * 0.19) * 0.6 + Math.sin(t * 0.11 + i * 0.07) * 0.4;
    const k = Math.round(s * maxShift);
    if (k === 0) {
      out.push(line);
      continue;
    }
    if (k > 0) out.push(" ".repeat(k) + line.slice(0, Math.max(0, w - k)));
    else {
      const kk = Math.abs(k);
      out.push(line.slice(kk) + " ".repeat(kk));
    }
  }
  return out.join("\n");
}

function cssVars() {
  const s = getComputedStyle(document.documentElement);
  return {
    bg: s.getPropertyValue("--bg").trim() || "#0b0d0f",
    fg: s.getPropertyValue("--fg").trim() || "#e7e7e7",
  };
}

export function ZeroisoModule(props: { handle: string; initialSeed?: string }) {
  const handle = normalizeHandle(props.handle);
  const cfg = useMemo(() => defaultZeroisoConfig(), []);
  const [lockedSeed, setLockedSeed] = useState(false);
  const [seed, setSeed] = useState<string>(() => (props.initialSeed ? String(props.initialSeed) : ""));
  const [sshPub, setSshPub] = useState("");
  const [showFragments, setShowFragments] = useState(false);
  const [fragmentsText, setFragmentsText] = useState(() => cfg.fragments.join("\n"));
  const fragments = useMemo(() => parseFragmentsInput(fragmentsText), [fragmentsText]);

  const [scans, setScans] = useState<Partial<Record<ZeroisoScanSlot, DensityGrid>>>({});
  const mode = (scans.A && scans.B && scans.C ? 3 : scans.A ? 1 : 0) as 0 | 1 | 3;

  const [build, setBuild] = useState<ZeroisoBuildResult | null>(null);
  const [building, setBuilding] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const [frameIdx, setFrameIdx] = useState(0);
  const [tick, setTick] = useState(0);
  const reduced = useMemo(() => isReducedMotion(), []);

  const [gif, setGif] = useState<{ state: "idle" | "working" | "ready" | "error"; msg?: string; url?: string; frames?: number; fps?: number }>({
    state: "idle",
  });

  useEffect(() => {
    return () => {
      if (gif.url) URL.revokeObjectURL(gif.url);
    };
  }, [gif.url]);

  // Seed default: handle + timestamp (public, non-secret).
  useEffect(() => {
    let alive = true;
    if (seed || lockedSeed) return;
    seedFromHandle(handle)
      .then((s) => {
        if (!alive) return;
        if (!lockedSeed) setSeed(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [handle, seed, lockedSeed]);

  const generate = async (reason: string) => {
    if (!seed) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBuilding(true);
    setGif({ state: "idle" });
    try {
      const res = await buildZeroisoFrames({
        mode,
        seed,
        config: { ...cfg, fragments, frames: reduced ? 1 : cfg.frames, fps: reduced ? 1 : cfg.fps },
        scans,
        signal: ac.signal,
      });
      if (ac.signal.aborted) return;
      setBuild(res);
      setFrameIdx(0);
      void reason;
    } catch (e: any) {
      if (ac.signal.aborted) return;
      setBuild(null);
      setGif({ state: "error", msg: String(e?.message || e || "error") });
    } finally {
      if (!ac.signal.aborted) setBuilding(false);
    }
  };

  // Auto-generate once when seed becomes available, and when scans are captured.
  useEffect(() => {
    if (!seed) return;
    generate("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, mode, scans.A, scans.B, scans.C]);

  // Micro shift (resting activity).
  useEffect(() => {
    if (reduced) return;
    let t: number | null = null;
    const step = () => {
      const next = 800 + Math.random() * 700;
      t = window.setTimeout(() => {
        setTick((x) => x + 1);
        step();
      }, next);
    };
    step();
    return () => {
      if (t !== null) window.clearTimeout(t);
    };
  }, [reduced]);

  // Frame animation (requestAnimationFrame, no timers).
  useEffect(() => {
    if (reduced) return;
    if (!build || build.frames.length <= 1) return;
    let raf = 0;
    let prev = 0;
    let acc = 0;
    const step = (now: number) => {
      if (!prev) prev = now;
      const dt = Math.min(0.06, Math.max(0, (now - prev) / 1000));
      prev = now;
      acc += dt;
      const period = 1 / clamp(build.fps || 10, 1, 24);
      if (acc >= period) {
        acc %= period;
        setFrameIdx((i) => (i + 1) % build.frames.length);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [build, reduced]);

  const text = useMemo(() => {
    const base = build?.frames[frameIdx]?.text ?? "";
    if (!base) return "";
    if (reduced) return base;
    return microShift(base, seed, tick);
  }, [build, frameIdx, reduced, seed, tick]);

  const onScan = async (slot: ZeroisoScanSlot, file: File | null) => {
    if (!file) return;
    setBuilding(true);
    try {
      const den = await densityFromImageFile(file, cfg.grid.w, cfg.grid.h);
      setScans((prev) => ({ ...prev, [slot]: den }));
    } catch (e: any) {
      setGif({ state: "error", msg: String(e?.message || e || "scan error") });
    } finally {
      setBuilding(false);
    }
  };

  const onReset = () => {
    abortRef.current?.abort();
    if (gif.url) URL.revokeObjectURL(gif.url);
    setScans({});
    setGif({ state: "idle" });
    setFrameIdx(0);
  };

  const onSeedFromSsh = async () => {
    if (lockedSeed) return;
    setBuilding(true);
    try {
      const s = await seedFromSshPublicKey(sshPub);
      setSeed(s);
    } catch (e: any) {
      setGif({ state: "error", msg: String(e?.message || e || "seed error") });
    } finally {
      setBuilding(false);
    }
  };

  const onExportGif = async () => {
    if (!build?.frames?.length) return;
    setGif({ state: "working" });
    try {
      const { bg, fg } = cssVars();
      const exportBuild =
        reduced || build.frames.length <= 1
          ? await buildZeroisoFrames({
              mode,
              seed,
              config: { ...cfg, fragments, frames: cfg.frames, fps: cfg.fps },
              scans,
            })
          : build;
      const res = await exportZeroisoGif({
        frames: exportBuild.frames,
        fps: exportBuild.fps,
        bg,
        fg,
        loop: 0,
        canvasText: { fontPx: 10, linePx: 12, padPx: 4 },
      });
      const url = URL.createObjectURL(res.blob);
      if (gif.url) URL.revokeObjectURL(gif.url);
      setGif({ state: "ready", url, frames: res.frames, fps: res.fps });
    } catch (e: any) {
      setGif({ state: "error", msg: String(e?.message || e || "export error") });
    }
  };

  const Cmd = (p: { id: string; label: string; on: () => void; disabled?: boolean }) => (
    <a
      className="zeroisoCmd"
      href="#"
      aria-label={p.id}
      onClick={(e) => {
        e.preventDefault();
        if (p.disabled) return;
        p.on();
      }}
      onKeyDown={(e) => {
        if (e.repeat) return;
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        if (p.disabled) return;
        p.on();
      }}
      tabIndex={0}
      data-disabled={p.disabled ? "1" : "0"}
    >
      {p.label}
    </a>
  );

  const scanLine = mode === 3 ? "scan×3" : mode === 1 ? "scan×1" : "seed";

  return (
    <section className="zeroisoModule" aria-label="0isO module">
      <div className="zeroisoTop">
        <div className="zeroisoTitle" aria-label="0isO">
          0isO
        </div>
        <div className="zeroisoMeta" aria-hidden="true">
          {handle} · {scanLine} · {building ? "…" : " "}
        </div>
      </div>

      <div className="zeroisoCmds" aria-label="commands">
        <Cmd id="generate" label="GENERATE" on={() => generate("manual")} disabled={!seed || building} />
        <Cmd id="edit_fragments" label="EDIT FRAGMENTS" on={() => setShowFragments((v) => !v)} disabled={building} />
        <Cmd id="lock_seed" label={lockedSeed ? "UNLOCK SEED" : "LOCK SEED"} on={() => setLockedSeed((v) => !v)} disabled={building} />
        <Cmd id="export_gif" label="EXPORT GIF" on={onExportGif} disabled={!build?.frames?.length || building} />
        <Cmd id="reset" label="RESET" on={onReset} disabled={building} />
      </div>

      <div className="zeroisoLine" aria-label="seed">
        <span className="zeroisoKey">seed</span>
        <input
          className="zeroisoInput"
          aria-label="seed"
          value={seed}
          placeholder="—"
          readOnly={lockedSeed}
          onChange={(e) => setSeed(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (!lockedSeed) setSeed((x) => x.trim());
          }}
          autoCorrect="off"
          spellCheck={false}
        />
        <span className="zeroisoKey">ssh</span>
        <input
          className="zeroisoInput"
          aria-label="ssh public key"
          value={sshPub}
          onChange={(e) => setSshPub(e.target.value)}
          placeholder="ssh-ed25519 AAAA…"
          autoCorrect="off"
          spellCheck={false}
        />
        <Cmd id="ssh_to_seed" label="SSH→SEED" on={onSeedFromSsh} disabled={!sshPub || lockedSeed || building} />
      </div>

      <div className="zeroisoLine" aria-label="capture">
        <span className="zeroisoKey">capture</span>
        <input
          className="zeroisoFile"
          aria-label="capture A"
          type="file"
          accept="image/*"
          onChange={(e) => onScan("A", e.target.files?.[0] ?? null)}
        />
        <input
          className="zeroisoFile"
          aria-label="capture B"
          type="file"
          accept="image/*"
          onChange={(e) => onScan("B", e.target.files?.[0] ?? null)}
        />
        <input
          className="zeroisoFile"
          aria-label="capture C"
          type="file"
          accept="image/*"
          onChange={(e) => onScan("C", e.target.files?.[0] ?? null)}
        />
      </div>

      {showFragments ? (
        <div className="zeroisoLine" aria-label="fragments">
          <span className="zeroisoKey">fragments</span>
          <textarea
            className="zeroisoTextarea"
            aria-label="fragments text"
            value={fragmentsText}
            onChange={(e) => setFragmentsText(e.target.value)}
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
      ) : null}

      <pre className="zeroisoPre" aria-label="0isO ascii">
        {text}
      </pre>

      <div className="zeroisoStatus" aria-label="status">
        <span aria-hidden="true">{seed ? `seed:${seed}` : "seed:—"}</span>
        <span aria-hidden="true">{build ? `grid:${build.grid.w}x${build.grid.h}` : "grid:—"}</span>
        <span aria-hidden="true">{build ? `frames:${build.frames.length}` : "frames:—"}</span>
        <span aria-hidden="true">{build ? `fps:${build.fps}` : "fps:—"}</span>
        {gif.state === "working" ? <span aria-hidden="true">GIF…</span> : null}
        {gif.state === "ready" ? (
          <>
            <span aria-hidden="true">{`GIF prêt: ${gif.frames} frames / ${gif.fps}fps`}</span>
            {gif.url ? (
              <a href={gif.url} download="0isO.gif" aria-label="download 0isO.gif">
                0isO.gif
              </a>
            ) : null}
          </>
        ) : null}
        {gif.state === "error" ? <span aria-hidden="true">{`err:${gif.msg ?? "?"}`}</span> : null}
      </div>
    </section>
  );
}
