// Guardrail O.: UI globale = zéro image (no img/picture/source tags, no background-image URLs).
export function assertNoImagesInDOM(
  root: ParentNode = document,
  opts?: { allowIn?: string | Element | null }
): void {
  const allowIn = opts?.allowIn ?? null;
  const isAllowed = (el: Element): boolean => {
    if (!allowIn) return false;
    if (typeof allowIn === "string") return Boolean(el.closest(allowIn));
    if (allowIn instanceof Element) return allowIn.contains(el);
    return false;
  };

  const imgs = root.querySelectorAll("img, picture, source");
  for (const img of imgs) {
    if (isAllowed(img)) continue;
    throw new Error("O. RULE: img/picture/source interdits dans l’UI globale.");
  }

  const nodes = root.querySelectorAll<HTMLElement>("*");
  for (const el of nodes) {
    if (isAllowed(el)) continue;
    const s = getComputedStyle(el);
    const bg = s.backgroundImage;
    const mask = (s as any).maskImage as string | undefined;
    const list = s.listStyleImage;

    const hasUrl = (v: string | null | undefined) => Boolean(v && v !== "none" && /url\s*\(/i.test(v));
    if (hasUrl(bg) || hasUrl(mask) || hasUrl(list)) throw new Error("O. RULE: background-image interdit dans l’UI globale.");
  }
}

export function assertBicolorVars(): void {
  const s = getComputedStyle(document.documentElement);
  const required = ["--bg", "--fg"];
  for (const v of required) {
    if (!s.getPropertyValue(v).trim()) throw new Error(`O. RULE: variable CSS manquante: ${v}`);
  }
}
