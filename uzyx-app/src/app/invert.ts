export function isInverted(): boolean {
  const d = document.documentElement.dataset;
  return d.theme === "inverse" || d.invert === "true";
}

export function setInvert(next: boolean): void {
  const root = document.documentElement;
  root.dataset.invert = next ? "true" : "false";
  if (next) root.dataset.theme = "inverse";
  else delete root.dataset.theme;
}

export function toggleInvert(): void {
  setInvert(!isInverted());
}
