/* Random "bug": replace some o/e by 0/3, as vivid orange links to qu3st/manif3st. */
(() => {
  const roots = Array.from(document.querySelectorAll("[data-glitch-oe]"));
  if (!roots.length) return;

  function rand01() {
    try {
      const a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return a[0] / 4294967296;
    } catch {
      return Math.random();
    }
  }

  function isPhpMode() {
    if (window.location.pathname.endsWith(".php")) return true;
    // If we're serving index.php at /, the page still contains .php links/actions.
    return Boolean(document.querySelector("a[href$='.php'], form[action$='.php']"));
  }

  const php = isPhpMode();
  const manifHref = php ? "/manif3st.php" : "/manif3st.html";
  const questHref = php ? "/qu3st.php" : "/qu3st.html";
  const here = (window.location.pathname || "").toLowerCase();

  function pickHref() {
    if (here.includes("manif3st")) return questHref;
    if (here.includes("qu3st")) return manifHref;
    return rand01() < 0.5 ? questHref : manifHref;
  }

  function shouldSkipTextNode(node) {
    const p = node.parentElement;
    if (!p) return true;
    if (p.closest("a, script, style, noscript, textarea, input")) return true;
    return false;
  }

  roots.forEach((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (!n || !n.nodeValue) continue;
      if (shouldSkipTextNode(n)) continue;
      textNodes.push(n);
    }

    const candidates = [];
    textNodes.forEach((node, nodeIndex) => {
      const s = node.nodeValue || "";
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        const lo = ch.toLowerCase();
        if (lo === "o" || lo === "e") candidates.push({ nodeIndex, i, lo });
      }
    });

    if (!candidates.length) return;

    const desired = Math.min(
      candidates.length,
      Math.max(10, Math.min(60, Math.round(candidates.length * 0.07))),
    );

    // Shuffle (Fisher–Yates) and pick first N.
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rand01() * (i + 1));
      const tmp = candidates[i];
      candidates[i] = candidates[j];
      candidates[j] = tmp;
    }

    const picked = new Map(); // key: `${nodeIndex}:${i}` -> href
    for (let k = 0; k < desired; k++) {
      const c = candidates[k];
      picked.set(`${c.nodeIndex}:${c.i}`, pickHref());
    }

    textNodes.forEach((node, nodeIndex) => {
      const s = node.nodeValue || "";
      const frag = document.createDocumentFragment();
      for (let i = 0; i < s.length; i++) {
        const key = `${nodeIndex}:${i}`;
        const href = picked.get(key);
        if (!href) {
          frag.appendChild(document.createTextNode(s[i]));
          continue;
        }

        const lo = s[i].toLowerCase();
        const repl = lo === "o" ? "0" : "3";
        const a = document.createElement("a");
        a.className = "glitch-link";
        a.href = href;
        a.textContent = repl;
        a.setAttribute("aria-label", href.includes("qu3st") ? "qu3st" : "manif3st");
        frag.appendChild(a);
      }
      node.parentNode.replaceChild(frag, node);
    });
  });
})();

