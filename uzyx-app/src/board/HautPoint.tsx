import React from "react";
import { useHautPointReveal } from "./useHautPointReveal";

export function HautPoint(props: { href?: string; label?: string }) {
  const { href = "/haut-point", label = "Haut Point" } = props;
  const { revealed, glitching } = useHautPointReveal();

  return (
    <a
      className={`hautPoint ${revealed ? "is-revealed" : ""} ${glitching ? "is-glitch" : ""}`}
      href={href}
      aria-label={label}
      data-revealed={revealed ? "1" : "0"}
      data-glitching={glitching ? "1" : "0"}
    >
      <span className="hautPointLabel">{label}</span>
      <span className="hautPointDot" aria-hidden="true" />
    </a>
  );
}
