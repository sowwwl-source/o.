import React, { useEffect, useMemo, useRef, useState } from "react";
import "./questStep2Strates.css";

type Mode = "vb" | "va" | "eq";

const VB = [
  "La spirale no vuelve,",
  "it only expands,",
  "elle se transforme.",
  "",
  "Nautilus grows sin repetir,",
  "jamais au même point,",
  "never exactly the same.",
  "",
  "El pulpo no tiene centro,",
  "it is a network,",
  "un réseau vivant.",
  "",
  "Many eyes, ninguna mirada fija,",
  "plusieurs perceptions,",
  "no single command.",
  "",
  "@ is membrane,",
  "es puente,",
  "une peau entre dedans et dehors.",
  "",
  "Hermitage no es huida,",
  "it is resonance,",
  "c’est silence amplifié.",
  "",
  "ÂÂ — el eco regresa cambiado,",
  "the echo returns altered,",
  "la pensée devient autre.",
  "",
  "You are not a point,",
  "no eres un núcleo,",
  "tu es une constellation en mouvement.",
  "",
  "En el agua oscura",
  "something forms",
  "sin nombre fijo.",
  "",
  "No answer.",
  "Una estructura.",
  "A becoming.",
].join("\n");

const VA = [
  "vA — Math / méta\n",
  "1) Spirale (Nautilus) : r(θ) = a e^{bθ}  ⇒  r(θ+2π) = e^{2πb} r(θ) ≠ r(θ)",
  "   → même forme, autre échelle : répétition apparente, déplacement réel.\n",
  "2) Réseau (poulpe) : graphe distribué, pas de centre.",
  "   x_{t+1} = σ(Ax_t + u_t)  (diffusion + non-linéarité)\n",
  "3) Membrane (@) : traduction intérieur/extérieur.",
  "   y_t = 𝕄(x_t)\n",
  "4) Écho (ÂÂ) : retour différé et transformateur.",
  "   Ψ_t = y_t + λ y_{t-τ}\n",
  "Synthèse : Ψ = 𝔈_τ( 𝕄( 𝔊(X) ) )",
  "→ croissance non répétitive + réseau + interface + résonance.",
].join("\n");

const EQ = [
  "Ψ = 𝔈_τ( 𝕄( 𝔊(X) ) )",
  "",
  "r(θ) = a e^{bθ}",
  "x_{t+1} = σ(Ax_t + u_t)",
  "y_t = 𝕄(x_t)",
  "Ψ_t = y_t + λ y_{t-τ}",
].join("\n");

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

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return false;
  return Boolean(t.closest("input,textarea,select,[contenteditable='true']"));
}

export function QuestStep2Strates() {
  const [mode, setMode] = useState<Mode>("vb");
  const [mystery, setMystery] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const noteTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!note) return;
    if (noteTimerRef.current) window.clearTimeout(noteTimerRef.current);
    noteTimerRef.current = window.setTimeout(() => {
      noteTimerRef.current = null;
      setNote(null);
    }, 900);
    return () => {
      if (noteTimerRef.current) window.clearTimeout(noteTimerRef.current);
      noteTimerRef.current = null;
    };
  }, [note]);

  const text = useMemo(() => (mode === "vb" ? VB : mode === "va" ? VA : EQ), [mode]);

  const onCopy = async () => {
    const ok = await copyText(EQ);
    setNote(ok ? "copié" : "copy:err");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (isTypingTarget(e.target)) return;
      const k = String(e.key || "").toLowerCase();
      if (k === "1") setMode("vb");
      if (k === "2") setMode("va");
      if (k === "3") setMode("eq");
      if (k === "m") setMystery((v) => !v);
      if (k === "c") void onCopy();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="qS2Root" aria-label="nautilus octopus" data-mode={mode} data-mystery={mystery ? "on" : "off"}>
      <header className="qS2Top" aria-label="strates top">
        <div className="qS2Title" aria-hidden="true">
          Nautilus / Octopus — strates
        </div>
        <div className="qS2Hint" aria-hidden="true">
          1:vB · 2:vA · 3:eq · m:myst · c:copy
        </div>
      </header>

      <nav className="qS2Cmds" aria-label="strates commands">
        <a
          className="qS2Cmd"
          href="#"
          data-active={mode === "vb" ? "1" : "0"}
          aria-label="mode vb"
          onClick={(e) => {
            e.preventDefault();
            setMode("vb");
          }}
        >
          vB
        </a>
        <a
          className="qS2Cmd"
          href="#"
          data-active={mode === "va" ? "1" : "0"}
          aria-label="mode va"
          onClick={(e) => {
            e.preventDefault();
            setMode("va");
          }}
        >
          vA
        </a>
        <a
          className="qS2Cmd"
          href="#"
          data-active={mode === "eq" ? "1" : "0"}
          aria-label="mode equation"
          onClick={(e) => {
            e.preventDefault();
            setMode("eq");
          }}
        >
          FORMULE
        </a>
        <a
          className="qS2Cmd"
          href="#"
          data-active={mystery ? "1" : "0"}
          aria-label="mystery"
          onClick={(e) => {
            e.preventDefault();
            setMystery((v) => !v);
          }}
        >
          MYST
        </a>
        <a
          className="qS2Cmd"
          href="#"
          aria-label="copy formula"
          onClick={(e) => {
            e.preventDefault();
            void onCopy();
          }}
        >
          COPY
        </a>
        <span className="qS2Note" aria-live="polite">
          {note ?? " "}
        </span>
      </nav>

      <pre className="qS2Text" aria-label="strates content">
        {text}
      </pre>

      <div className="qS2Meta" aria-hidden="true">
        indice: la “réponse” n’est pas un centre · Nautilus @ L’hermitÂÂÂge
      </div>
    </section>
  );
}

