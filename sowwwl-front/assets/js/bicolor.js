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

  // ====== Light typography glitch: reveal/mute some links ======
  const reduceMotion = (() => {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  })();

  function rand01() {
    try {
      const a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return a[0] / 4294967296;
    } catch {
      return Math.random();
    }
  }

  function randInt(minInclusive, maxInclusive) {
    const min = Math.ceil(minInclusive);
    const max = Math.floor(maxInclusive);
    return Math.floor(rand01() * (max - min + 1)) + min;
  }

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand01() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function glitchCandidates() {
    const links = Array.from(document.querySelectorAll("a[href]"));
    return links.filter((a) => {
      if (!(a instanceof HTMLAnchorElement)) return false;
      if (a.classList.contains("btn")) return false;
      if (a.classList.contains("o-card")) return false;
      if (a.classList.contains("glitch-link")) return false;
      if (a.closest("[data-no-glitch]")) return false;
      // Ignore empty anchors
      if (!a.textContent || a.textContent.trim() === "") return false;
      return true;
    });
  }

  function scheduleGlitch() {
    if (reduceMotion) return;
    const delay = randInt(4200, 16000);
    setTimeout(runGlitch, delay);
  }

  function runGlitch() {
    if (reduceMotion) return;
    if (document.hidden) return scheduleGlitch();
    if (flipping) return scheduleGlitch();

    const rootEl = document.documentElement;
    rootEl.classList.add("is-glitch");

    const candidates = glitchCandidates();
    shuffleInPlace(candidates);
    const pick = candidates.slice(0, randInt(2, Math.min(10, candidates.length || 2)));

    const mode = rand01() < 0.68 ? "reveal" : "mute";
    const className = mode === "reveal" ? "glitch-reveal" : "glitch-mute";
    pick.forEach((a) => a.classList.add(className));

    const duration = randInt(80, 180);
    setTimeout(() => {
      rootEl.classList.remove("is-glitch");
      pick.forEach((a) => a.classList.remove("glitch-reveal", "glitch-mute"));
      scheduleGlitch();
    }, duration);
  }

  scheduleGlitch();

  // ====== C0ntr0l: accelerometer / orientation scroll (mobile, opt-in) ======
  // Goal: on smartphones, allow scrolling with device tilt AFTER explicit permission request.
  (() => {
    const isPreview = Boolean(window.__O_PREVIEW__);
    const isCoarse = (() => {
      try {
        return window.matchMedia("(pointer: coarse)").matches;
      } catch {
        return false;
      }
    })();
    const hasTouch = typeof navigator !== "undefined" && (navigator.maxTouchPoints || 0) > 0;
    const isMobile = isPreview || isCoarse || hasTouch;

    const hasMotion =
      typeof window.DeviceOrientationEvent !== "undefined" ||
      typeof window.DeviceMotionEvent !== "undefined";

    if (!isMobile || (!hasMotion && !isPreview)) return;

    // UI
    const wrap = document.createElement("div");
    wrap.className = "o-c0ntr0l";
    wrap.setAttribute("data-no-flip", "");
    wrap.setAttribute("data-no-glitch", "");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn o-c0ntr0l-btn";
    btn.setAttribute("aria-pressed", "false");

    const label = document.createElement("span");
    label.textContent = "C0ntr0l";

    const state = document.createElement("span");
    state.className = "o-c0ntr0l-state";
    state.textContent = "0";

    const msg = document.createElement("div");
    msg.className = "o-c0ntr0l-msg muted";
    msg.textContent = "";

    btn.appendChild(label);
    btn.appendChild(state);
    wrap.appendChild(btn);
    wrap.appendChild(msg);
    document.body.appendChild(wrap);

    // Motion state
    const CFG = {
      deadDeg: 3.5,
      maxDeg: 26,
      maxSpeedPxPerS: 1700,
      smooth: 0.14,
    };

    let enabled = false;
    let baseAxis = null;
    let axis = 0;
    let velocity = 0;
    let raf = 0;
    let lastTs = 0;

    function clamp(n, lo, hi) {
      return Math.min(hi, Math.max(lo, n));
    }

    function angle() {
      const a = window.screen?.orientation?.angle;
      if (typeof a === "number") return a;
      // eslint-disable-next-line no-undef
      const w = window.orientation;
      if (typeof w === "number") return w;
      return 0;
    }

    function axisFrom(beta, gamma) {
      const a = angle();
      // Normalize common values
      const ang = a === -90 ? 270 : a;
      if (ang === 90) return -gamma;
      if (ang === 270) return gamma;
      if (ang === 180) return -beta;
      return beta;
    }

    function tiltToSpeed(deg) {
      const sign = deg < 0 ? -1 : 1;
      const abs = Math.abs(deg);
      if (abs < CFG.deadDeg) return 0;
      const clipped = clamp(abs, CFG.deadDeg, CFG.maxDeg);
      const n = (clipped - CFG.deadDeg) / (CFG.maxDeg - CFG.deadDeg); // 0..1
      const curve = n * n;
      return sign * curve * CFG.maxSpeedPxPerS;
    }

    function onOrientation(e) {
      if (!enabled) return;
      const beta = e.beta;
      const gamma = e.gamma;
      if (typeof beta !== "number" || typeof gamma !== "number") return;
      const ax = axisFrom(beta, gamma);
      if (baseAxis === null) baseAxis = ax;
      axis = ax - baseAxis;
    }

    function step(ts) {
      if (!enabled) return;
      const scroller = document.scrollingElement || document.documentElement;
      const maxScroll = Math.max(0, scroller.scrollHeight - window.innerHeight);

      const dt = lastTs ? (ts - lastTs) / 1000 : 0;
      lastTs = ts;

      const activeEl = document.activeElement;
      const editing =
        activeEl instanceof Element && activeEl.matches("input, textarea, select, option");

      const target = editing ? 0 : tiltToSpeed(axis);
      velocity = velocity * (1 - CFG.smooth) + target * CFG.smooth;

      if (dt > 0 && maxScroll > 0) {
        const next = clamp(scroller.scrollTop + velocity * dt, 0, maxScroll);
        scroller.scrollTop = next;
      }

      raf = requestAnimationFrame(step);
    }

    function setUI(on, errorText = "") {
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      state.textContent = on ? "1" : "0";
      state.classList.toggle("on", on);
      state.classList.toggle("err", !on && Boolean(errorText));
      msg.textContent = errorText || (on ? "incline → scroll" : "");
    }

    async function requestPermissionIfNeeded() {
      // iOS Safari: permission requests exist and must be called from user gesture.
      // Some browsers require secure context; handle errors gracefully.
      const isLocal =
        window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

      const reqs = [];
      let needsPrompt = false;
      try {
        // eslint-disable-next-line no-undef
        if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
          // eslint-disable-next-line no-undef
          needsPrompt = true;
          reqs.push(DeviceOrientationEvent.requestPermission());
        }
      } catch {}

      try {
        // eslint-disable-next-line no-undef
        if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
          // eslint-disable-next-line no-undef
          needsPrompt = true;
          reqs.push(DeviceMotionEvent.requestPermission());
        }
      } catch {}

      if (needsPrompt && !window.isSecureContext && !isLocal) {
        throw new Error("secure_context_required");
      }

      if (!reqs.length) return;
      const results = await Promise.allSettled(reqs);
      const granted = results.some((r) => r.status === "fulfilled" && r.value === "granted");
      if (!granted) throw new Error("permission_denied");
    }

    function enable() {
      enabled = true;
      baseAxis = null;
      axis = 0;
      velocity = 0;
      lastTs = 0;
      window.addEventListener("deviceorientation", onOrientation, { passive: true });
      raf = requestAnimationFrame(step);
      setUI(true);

      // If the browser never emits sensor values, fail softly.
      setTimeout(() => {
        if (!enabled) return;
        if (baseAxis === null) disable("capteur off");
      }, 1800);
    }

    function disable(errorText = "") {
      enabled = false;
      window.removeEventListener("deviceorientation", onOrientation);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      setUI(false, errorText);
    }

    // Toggle
    btn.addEventListener("click", async () => {
      if (enabled) return disable();
      setUI(false, "");
      try {
        await requestPermissionIfNeeded();
        enable();
      } catch (e) {
        const msg = String(e?.message || e);
        if (msg === "secure_context_required") return disable("HTTPS requis");
        if (msg === "permission_denied") return disable("refusé");
        return disable("indisponible");
      }
    });

    // Double tap = calibrate (re-center)
    btn.addEventListener("dblclick", (e) => {
      e.preventDefault();
      if (!enabled) return;
      baseAxis = null;
      axis = 0;
      velocity = 0;
      setUI(true, "recalibré");
      setTimeout(() => setUI(true), 900);
    });

    setUI(false);
  })();
})();
