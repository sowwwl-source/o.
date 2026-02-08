export function toggleThemeInverse() {
  const root = document.documentElement;
  const next = root.dataset.theme === "inverse" ? "" : "inverse";
  if (next) root.dataset.theme = next;
  else delete root.dataset.theme;

  // Keep legacy invert flag in sync (many parts observe `data-invert`).
  root.dataset.invert = next ? "true" : "false";
}

