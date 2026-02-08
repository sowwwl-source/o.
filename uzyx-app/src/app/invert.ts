export function isInverted(): boolean {
  return document.documentElement.dataset.invert === "true";
}

export function setInvert(next: boolean): void {
  document.documentElement.dataset.invert = next ? "true" : "false";
}

export function toggleInvert(): void {
  document.documentElement.dataset.invert =
    document.documentElement.dataset.invert === "true" ? "false" : "true";
}

