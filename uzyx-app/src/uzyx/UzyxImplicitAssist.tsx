import React, { useEffect, useState } from "react";
import "./uzyxAssist.css";
import { uzyxFooterAPI } from "@/uzyx";
import { useUzyxState } from "./useUzyxState";

type Props = {
  routeKey: string;
  appNode?: string | null;
};

type Hint = {
  id: string;
  title: string;
  text: string;
};

const SEEN_PREFIX = "uzyx:assist:seen:v3:";

function normalizeNode(node?: string | null): string {
  return String(node || "").trim().toUpperCase();
}

function hasSeen(id: string): boolean {
  try {
    return Boolean(localStorage.getItem(`${SEEN_PREFIX}${id}`));
  } catch {
    return false;
  }
}

function markSeen(id: string) {
  try {
    localStorage.setItem(`${SEEN_PREFIX}${id}`, "1");
  } catch {
    // ignore
  }
}

function hintsFor(routeKey: string, appNode?: string | null): Hint[] {
  const node = normalizeNode(appNode);
  const hints: Hint[] = [];

  if (routeKey === "home") {
    hints.push({ id: "home-invert", title: "inversion", text: "i : inverser le champ" });
  }

  if (routeKey === "entry") {
    hints.push({ id: "entry-anchor", title: "entry", text: "adresse + code : ANCRER. Entree envoie." });
  }

  if (routeKey === "app") {
    hints.push({ id: "app-shell", title: "plans", text: "swipe ou <- -> : intro / menu / page" });
  }

  if (node === "HAUT") {
    hints.push({ id: "haut-point", title: "haut point", text: "tenir . O. immobile : delta z" });
  }

  if (node === "LAND") {
    hints.push({ id: "land-invert", title: "land", text: "tap vide : inversion. lambda : glisser / molette" });
  }

  if (node === "FERRY") {
    hints.push({ id: "ferry-controls", title: "ferry", text: "Entree : creer / rejoindre. Esc : quitter." });
  }

  if (node === "CONTACT") {
    hints.push({ id: "contact-invite", title: "contact", text: "Entree : ajouter. Tenir un contact : inviter." });
  }

  if (routeKey === "cloud") {
    hints.push({ id: "cloud-key", title: "cloud", text: "colle une cle publique. jamais une cle privee" });
  }

  return hints;
}

export function UzyxImplicitAssist(props: Props) {
  const uzyx = useUzyxState();
  const [hint, setHint] = useState<Hint | null>(null);

  useEffect(() => {
    if (uzyx.failSafe) {
      setHint(null);
      return;
    }

    const nextHint = hintsFor(props.routeKey, props.appNode).find((item) => !hasSeen(item.id)) ?? null;
    if (!nextHint) {
      setHint(null);
      return;
    }

    markSeen(nextHint.id);
    setHint(nextHint);

    const t = window.setTimeout(() => {
      setHint((current) => (current?.id === nextHint.id ? null : current));
    }, 8200);

    return () => window.clearTimeout(t);
  }, [props.routeKey, props.appNode, uzyx.failSafe]);

  if (uzyx.failSafe) {
    return (
      <aside className="uzyxAssistCard is-recovery" aria-live="polite" aria-label="mode calme">
        <div className="uzyxAssistTitle">mode calme</div>
        <div className="uzyxAssistText">gestes trop denses detectes. reprise manuelle ou auto apres 60 s.</div>
        <div className="uzyxAssistCmds">
          <a
            className="uzyxAssistCmd"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              uzyxFooterAPI.setUzyxState({ failSafe: false, unstable: false });
            }}
          >
            reprendre
          </a>
        </div>
      </aside>
    );
  }

  if (!hint) return null;

  return (
    <aside className="uzyxAssistCard" aria-live="polite" aria-label={hint.title}>
      <div className="uzyxAssistTitle">{hint.title}</div>
      <div className="uzyxAssistText">{hint.text}</div>
      <div className="uzyxAssistCmds">
        <a
          className="uzyxAssistCmd"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setHint(null);
          }}
        >
          compris
        </a>
      </div>
    </aside>
  );
}
