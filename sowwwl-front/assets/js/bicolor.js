/* Bicolor (server-driven) + typography glitch + C0ntr0l */
(() => {
  const root = document.documentElement;
  const STORE_INV = "o:inv";
  const STORE_FOCUS = "o:focus";
  const STORE_DEPTH = "o:depth";
  const STORE_UID = "o:uid";
  const STORE_SEQ_PREFIX = "o:seq:";
  const STORE_LAND_PREFIX = "o:land:";

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

  function toInt(v, fallback = 0) {
    const n = Number.parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? n : fallback;
  }

  function zoomFromDepth(depth) {
    // Infinite but slow (log): 1.12 @ 1 click, ~1.83 @ 100 clicks.
    return 1 + Math.log1p(depth) * 0.18;
  }

  function stateFromSeq(seq) {
    const depth = Math.max(0, toInt(seq, 0));
    const inv = depth % 2 === 1;
    const focus = inv ? "o" : "dot";
    return { inv, focus, depth };
  }

  function applyVisualState(next) {
    root.classList.toggle("is-inverted", Boolean(next.inv));
    root.dataset.focus = clampFocus(next.focus);
    root.style.setProperty("--zoom", String(zoomFromDepth(Math.max(0, toInt(next.depth, 0)))));

    storage.set(STORE_INV, next.inv ? "1" : "0");
    storage.set(STORE_FOCUS, clampFocus(next.focus));
    storage.set(STORE_DEPTH, String(Math.max(0, toInt(next.depth, 0))));
  }

  // Apply cached state immediately (prevents flicker). Server sync will override.
  applyVisualState({
    inv: storage.get(STORE_INV) === "1",
    focus: clampFocus(storage.get(STORE_FOCUS)),
    depth: toInt(storage.get(STORE_DEPTH), 0),
  });

  // Track last pointer/touch position so flips can originate from touch on iOS/Android.
  const lastPointer = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    ts: 0,
  };

  function recordPointer(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    lastPointer.x = x;
    lastPointer.y = y;
    lastPointer.ts = Date.now();
  }

  function recordFromEvent(e) {
    if (!e) return;
    if (typeof e.clientX === "number" && typeof e.clientY === "number") {
      recordPointer(e.clientX, e.clientY);
      return;
    }
    const t = e.touches && e.touches[0];
    if (t && typeof t.clientX === "number" && typeof t.clientY === "number") {
      recordPointer(t.clientX, t.clientY);
    }
  }

  window.addEventListener("pointerdown", recordFromEvent, { capture: true, passive: true });
  window.addEventListener("pointermove", recordFromEvent, { capture: true, passive: true });
  window.addEventListener("touchstart", recordFromEvent, { capture: true, passive: true });
  window.addEventListener("touchmove", recordFromEvent, { capture: true, passive: true });

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

  function bestOrigin(fallbackX, fallbackY) {
    const recent = Date.now() - lastPointer.ts < 5000;
    if (recent) return { x: lastPointer.x, y: lastPointer.y };
    return originFromFocus(fallbackX, fallbackY);
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

  async function irisCommit(commit, origin) {
    if (flipping) return;
    flipping = true;

    const o = origin || bestOrigin(window.innerWidth / 2, window.innerHeight / 2);
    const iris = createIris(o.x, o.y);
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

    try {
      commit();
    } finally {
      iris.remove();
      flipping = false;
    }
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

  // ====== Server-driven flip (token stored in profile; multi-device) ======
  const api = {
    async json(path, opts) {
      const res = await fetch(path, Object.assign({ credentials: "include" }, opts || {}));
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
      return { ok: res.ok, status: res.status, data };
    },
  };

  const ux = {
    uid: toInt(storage.get(STORE_UID), 0) || null,
    csrf: "",
    seq: null,
    seqKey(uid) {
      return `${STORE_SEQ_PREFIX}${uid}`;
    },
    lastSeq(uid) {
      const v = storage.get(this.seqKey(uid));
      if (v === null) return null;
      return toInt(v, 0);
    },
    remember(uid, seq) {
      storage.set(STORE_UID, String(uid));
      storage.set(this.seqKey(uid), String(seq));
    },
    landKey(uid) {
      return `${STORE_LAND_PREFIX}${uid}`;
    },
    lastLand(uid) {
      const v = storage.get(this.landKey(uid));
      return v ? String(v) : null;
    },
    rememberLand(uid, landType) {
      storage.set(this.landKey(uid), String(landType || ""));
    },
  };

  function normalizeLandType(v) {
    const t = String(v || "").trim().toUpperCase();
    return t === "A" || t === "B" || t === "C" ? t : "";
  }

  function applyLandType(v) {
    const t = normalizeLandType(v);
    if (!t) {
      delete root.dataset.land;
      return;
    }
    root.dataset.land = t;
  }

  async function syncLandFromServer({ force = false } = {}) {
    const uid = ux.uid;
    if (!uid) {
      applyLandType("");
      return { ok: false, status: 401, data: { guest: true } };
    }

    const cached = ux.lastLand(uid);
    if (cached && !force) applyLandType(cached);

    const r = await api.json("/api/land");
    if (!r.ok) {
      if (r.status === 401) applyLandType("");
      return r;
    }

    const landType = normalizeLandType(r.data?.land?.land_type || r.data?.land?.type || r.data?.land_type);
    if (landType) {
      applyLandType(landType);
      ux.rememberLand(uid, landType);
    } else {
      applyLandType("");
      ux.rememberLand(uid, "");
    }
    return r;
  }

  async function syncFromServer({ animate = false } = {}) {
    const r = await api.json("/api/me");
    if (!r.ok) {
      ux.uid = null;
      ux.csrf = "";
      ux.seq = null;
      applyLandType("");
      return { ok: false, status: r.status, data: r.data };
    }

    const u = r.data?.user || {};
    const uid = toInt(u.id, 0) || null;
    const seq = Math.max(0, toInt(u.flip_seq, 0));

    ux.uid = uid;
    ux.csrf = String(r.data?.csrf || "");
    ux.seq = seq;

    const next = stateFromSeq(seq);
    const currentInv = root.classList.contains("is-inverted");
    const last = uid ? ux.lastSeq(uid) : null;

    if (uid) ux.remember(uid, seq);
    if (uid) {
      const cachedLand = ux.lastLand(uid);
      if (cachedLand) applyLandType(cachedLand);
      syncLandFromServer({ force: false }).catch(() => {});
    } else {
      applyLandType("");
    }

    // Avoid animating on first sync; animate only when token advances.
    const tokenAdvanced = last !== null && seq !== last;
    const themeChanged = next.inv !== currentInv;

    if (animate && tokenAdvanced && themeChanged) {
      await irisCommit(() => applyVisualState(next), bestOrigin(window.innerWidth / 2, window.innerHeight / 2));
      return { ok: true, status: r.status, data: r.data };
    }

    applyVisualState(next);
    return { ok: true, status: r.status, data: r.data };
  }

  async function threshold(name, origin) {
    if (flipping) return { ok: false, status: 409, data: { error: "busy" } };

    // Ensure we have csrf (and are authed)
    if (!ux.csrf) await syncFromServer({ animate: false });
    if (!ux.csrf) return { ok: false, status: 401, data: { guest: true } };

    const r = await api.json("/api/ux/threshold", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF": ux.csrf },
      body: JSON.stringify({ name: String(name || "") }),
    });

    if (!r.ok) return r;

    const seq = Math.max(0, toInt(r.data?.flip_seq, 0));
    ux.seq = seq;
    if (ux.uid) ux.remember(ux.uid, seq);

    const next = stateFromSeq(seq);
    const themeChanged = next.inv !== root.classList.contains("is-inverted");
    if (themeChanged) {
      await irisCommit(() => applyVisualState(next), origin || bestOrigin(window.innerWidth / 2, window.innerHeight / 2));
    } else {
      applyVisualState(next);
    }

    return r;
  }

  // Public helpers for pages: O.threshold("quest") and O.sync()
  window.O = window.O || {};
  window.O.threshold = threshold;
  window.O.sync = syncFromServer;

  // Initial sync (no animation) + resync on focus (multi-device).
  syncFromServer({ animate: false }).catch(() => {});
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    syncFromServer({ animate: true }).catch(() => {});
  });
  window.addEventListener("focus", () => syncFromServer({ animate: true }).catch(() => {}));

  // Optional: mark specific links/buttons as thresholds via data-threshold="name".
  document.addEventListener(
    "click",
    async (e) => {
      if (e.defaultPrevented) return;
      if (flipping) return;
      if (!(e.target instanceof Element)) return;
      const el = e.target.closest("[data-threshold]");
      if (!el) return;

      if (isInteractive(e.target)) return;

      const href = el.matches("a[href]") ? el.getAttribute("href") || "" : "";
      const isNav = Boolean(href) && isSameOriginHref(href);

      if (isNav && (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return;
      if (isNav && el.matches("a[target='_blank'], a[download]")) return;

      const name = (el.getAttribute("data-threshold") || "").trim() || "threshold";
      const origin = bestOrigin(e.clientX ?? window.innerWidth / 2, e.clientY ?? window.innerHeight / 2);

      if (isNav) e.preventDefault();
      try {
        await threshold(name, origin);
      } catch {}

      if (isNav) {
        window.location.href = new URL(href, window.location.href).toString();
      }
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
