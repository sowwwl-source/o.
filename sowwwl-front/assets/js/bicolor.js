/* Bicolor flip + soft navigation + O./. zoom */
(() => {
  const root = document.documentElement;
  const STORE_INV = "o:inv";
  const STORE_FOCUS = "o:focus";
  const STORE_DEPTH = "o:depth";

  const storage = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {}
    },
  };

  function clampFocus(v) {
    return v === "o" || v === "dot" ? v : "dot";
  }

  function readDepth() {
    const n = Number.parseInt(storage.get(STORE_DEPTH) || "0", 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function zoomFromDepth(depth) {
    // Infinite but slow (log): 1.12 @ 1 click, ~1.83 @ 100 clicks.
    return 1 + Math.log1p(depth) * 0.18;
  }

  // Apply stored state (no-op if storage is blocked)
  const storedInv = storage.get(STORE_INV) === "1";
  root.classList.toggle("is-inverted", storedInv);

  const storedFocus = clampFocus(storage.get(STORE_FOCUS));
  root.dataset.focus = storedFocus;

  let depth = readDepth();
  root.style.setProperty("--zoom", String(zoomFromDepth(depth)));

  function focusEl() {
    const focus = clampFocus(root.dataset.focus);
    const selector = focus === "o" ? ".mark-o" : ".mark-dot";
    return document.querySelector(selector);
  }

  function originFromFocus(fallbackX, fallbackY) {
    const el = focusEl();
    if (!el) return { x: fallbackX, y: fallbackY };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function createIris(x, y) {
    const iris = document.createElement("div");
    iris.className = "iris";
    iris.style.left = `${x}px`;
    iris.style.top = `${y}px`;
    iris.style.backgroundColor = getComputedStyle(document.body).color;
    document.body.appendChild(iris);
    // Force initial paint so transition triggers
    iris.getBoundingClientRect();
    const diag = Math.hypot(window.innerWidth, window.innerHeight);
    const base = 20;
    const scale = (diag / base) * 2.2;
    iris.style.transform = `translate(-50%,-50%) scale(${scale})`;
    return iris;
  }

  let flipping = false;

  async function flipAt(x, y) {
    if (flipping) return;
    flipping = true;

    const iris = createIris(x, y);
    await new Promise((resolve) => {
      const t = setTimeout(resolve, 650);
      iris.addEventListener(
        "transitionend",
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true },
      );
    });

    // Toggle theme
    const nowInv = !root.classList.contains("is-inverted");
    root.classList.toggle("is-inverted", nowInv);
    storage.set(STORE_INV, nowInv ? "1" : "0");

    // Zoom depth
    depth++;
    storage.set(STORE_DEPTH, String(depth));
    root.style.setProperty("--zoom", String(zoomFromDepth(depth)));

    // Alternate focus: O <-> .
    const nextFocus = clampFocus(root.dataset.focus) === "dot" ? "o" : "dot";
    root.dataset.focus = nextFocus;
    storage.set(STORE_FOCUS, nextFocus);

    iris.remove();
    flipping = false;
  }

  function isSameOriginHref(href) {
    if (!href) return false;
    try {
      const u = new URL(href, window.location.href);
      return u.origin === window.location.origin;
    } catch {
      return false;
    }
  }

  function isInteractive(target) {
    return Boolean(target?.closest("input, textarea, select, option, button, label"));
  }

  function linkTargetFromEventTarget(target) {
    const el = target?.closest("a[href], [data-href]");
    if (!el) return null;
    if (el.matches("a[href]")) return { el, href: el.getAttribute("href") || "" };
    return { el, href: el.getAttribute("data-href") || "" };
  }

  // Click = flip (except form editing). For links: flip then navigate.
  document.addEventListener(
    "click",
    async (e) => {
      if (e.defaultPrevented) return;
      if (flipping) {
        e.preventDefault();
        return;
      }

      // Allow pages to opt-out for specific interactive regions (e.g. 3D canvases).
      if (e.target instanceof Element && e.target.closest("[data-no-flip]")) return;

      const nav = linkTargetFromEventTarget(e.target);
      const isNav = Boolean(nav?.href) && isSameOriginHref(nav?.href);

      // Let modified clicks behave normally (new tab, context, etc.)
      if (isNav && (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return;
      if (isNav && nav?.el?.matches("a[target='_blank'], a[download]")) return;

      // Don't flip while interacting with inputs/textarea/etc.
      if (!isNav && isInteractive(e.target)) return;

      const origin = originFromFocus(
        e.clientX ?? window.innerWidth / 2,
        e.clientY ?? window.innerHeight / 2,
      );
      if (isNav) e.preventDefault();

      await flipAt(origin.x, origin.y);

      if (isNav && nav?.href) {
        const u = new URL(nav.href, window.location.href);
        window.location.href = u.toString();
      }
    },
    { capture: true },
  );

  // Make spans with data-href keyboard-activatable (Enter / Space).
  document.addEventListener(
    "keydown",
    async (e) => {
      if (e.defaultPrevented) return;
      if (e.key !== "Enter" && e.key !== " ") return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      const el = target.closest("[data-href]");
      if (!el) return;
      const href = el.getAttribute("data-href") || "";
      if (!isSameOriginHref(href)) return;
      e.preventDefault();

      const origin = originFromFocus(window.innerWidth / 2, window.innerHeight / 2);
      await flipAt(origin.x, origin.y);
      window.location.href = new URL(href, window.location.href).toString();
    },
    { capture: true },
  );
})();
