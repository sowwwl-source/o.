export type Tokens = {
  bg: string;
  fg: string;
  accent: string;
  halo: string;
  space: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  motion: {
    fast: string;
    slow: string;
  };
};

export const TOKENS: Tokens = {
  bg: "#0b0e0d",
  fg: "#e9ecea",
  accent: "#b7c0bb",
  halo: "rgba(233, 236, 234, 0.12)",
  space: {
    xs: "8px",
    sm: "14px",
    md: "22px",
    lg: "36px",
    xl: "56px",
  },
  motion: {
    fast: "180ms",
    slow: "420ms",
  },
};

export function applyTokens(tokens: Tokens) {
  const root = document.documentElement;
  root.style.setProperty("--bg", tokens.bg);
  root.style.setProperty("--fg", tokens.fg);
  root.style.setProperty("--accent", tokens.accent);
  root.style.setProperty("--halo", tokens.halo);
  root.style.setProperty("--space-xs", tokens.space.xs);
  root.style.setProperty("--space-sm", tokens.space.sm);
  root.style.setProperty("--space-md", tokens.space.md);
  root.style.setProperty("--space-lg", tokens.space.lg);
  root.style.setProperty("--space-xl", tokens.space.xl);
  root.style.setProperty("--motion-fast", tokens.motion.fast);
  root.style.setProperty("--motion-slow", tokens.motion.slow);
}

export function toggleInvert(force?: boolean) {
  const root = document.documentElement;
  const next =
    typeof force === "boolean"
      ? force
      : !root.classList.contains("is-inverted");
  root.classList.toggle("is-inverted", next);
}
