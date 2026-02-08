/* Toroidal scroll surface (wrap left/right + up/down). */
(() => {
  const reduceMotion = (() => {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  })();

  function isEditingElement(el) {
    return (
      el instanceof Element &&
      (el.matches("input, textarea, select, option") ||
        (el instanceof HTMLElement && (el.isContentEditable || el.getAttribute("contenteditable") === "true")))
    );
  }

  function nowMs() {
    return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  }

  function initTorus(scroller, opts = {}) {
    const plane = scroller.querySelector(".o-torus-plane");
    if (!plane) throw new Error("Missing .o-torus-plane");

    let tileW = Math.max(1, scroller.clientWidth);
    let tileH = Math.max(1, scroller.clientHeight);
    let wrapsX = 0;
    let wrapsY = 0;

    let driftOn = Boolean(opts.drift);
    let driftRaf = 0;
    let driftLast = 0;
    const driftVx = typeof opts.vx === "number" ? opts.vx : 18;
    const driftVy = typeof opts.vy === "number" ? opts.vy : 12;

    const readout = opts.readout || document.querySelector("[data-torus-readout]");

    function updateTileSize() {
      tileW = Math.max(1, scroller.clientWidth);
      tileH = Math.max(1, scroller.clientHeight);
    }

    function worldX() {
      return wrapsX * tileW + (scroller.scrollLeft - tileW);
    }
    function worldY() {
      return wrapsY * tileH + (scroller.scrollTop - tileH);
    }

    function render() {
      if (!(readout instanceof HTMLElement)) return;
      const x = Math.round(worldX());
      const y = Math.round(worldY());
      readout.textContent = `${x}, ${y}`;
    }

    function wrapAxis() {
      // Keep scroll position within the middle tile (index 1).
      while (scroller.scrollLeft < tileW * 0.5) {
        scroller.scrollLeft += tileW;
        wrapsX -= 1;
      }
      while (scroller.scrollLeft > tileW * 1.5) {
        scroller.scrollLeft -= tileW;
        wrapsX += 1;
      }

      while (scroller.scrollTop < tileH * 0.5) {
        scroller.scrollTop += tileH;
        wrapsY -= 1;
      }
      while (scroller.scrollTop > tileH * 1.5) {
        scroller.scrollTop -= tileH;
        wrapsY += 1;
      }
      render();
    }

    function center() {
      updateTileSize();
      scroller.scrollLeft = tileW;
      scroller.scrollTop = tileH;
      render();
    }

    function stepDrift(ts) {
      if (!driftOn) return;
      const t = typeof ts === "number" ? ts : nowMs();
      const dt = driftLast ? (t - driftLast) / 1000 : 0;
      driftLast = t;

      if (dt > 0) {
        scroller.scrollLeft += driftVx * dt;
        scroller.scrollTop += driftVy * dt;
        wrapAxis();
      }

      driftRaf = requestAnimationFrame(stepDrift);
    }

    function setDrift(on) {
      const next = Boolean(on) && !reduceMotion;
      if (next === driftOn) return;
      driftOn = next;
      driftLast = 0;
      if (driftRaf) cancelAnimationFrame(driftRaf);
      driftRaf = 0;
      if (driftOn) driftRaf = requestAnimationFrame(stepDrift);
    }

    function nudge(dx, dy) {
      scroller.scrollLeft += dx;
      scroller.scrollTop += dy;
      wrapAxis();
    }

    // Init position into the center tile.
    center();

    // Wrap on scroll.
    const onScroll = () => wrapAxis();
    scroller.addEventListener("scroll", onScroll, { passive: true });

    // Keep stable on resize.
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            const dx = scroller.scrollLeft - tileW;
            const dy = scroller.scrollTop - tileH;
            updateTileSize();
            scroller.scrollLeft = tileW + dx;
            scroller.scrollTop = tileH + dy;
            wrapAxis();
          })
        : null;
    if (ro) ro.observe(scroller);

    // Optional: keyboard navigation (arrows / WASD).
    const keys = Boolean(opts.keys);
    const onKeyDown = (e) => {
      if (!keys) return;
      if (e.defaultPrevented) return;
      const ae = document.activeElement;
      if (ae instanceof Element && ae.closest("#o-petals")) return;
      if (isEditingElement(document.activeElement)) return;

      const step = e.shiftKey ? 160 : 80;
      const k = String(e.key || "").toLowerCase();

      let dx = 0;
      let dy = 0;
      if (k === "arrowleft" || k === "a") dx = -step;
      if (k === "arrowright" || k === "d") dx = step;
      if (k === "arrowup" || k === "w") dy = -step;
      if (k === "arrowdown" || k === "s") dy = step;

      if (dx !== 0 || dy !== 0) {
        e.preventDefault();
        nudge(dx, dy);
      }
      if (k === "0") {
        e.preventDefault();
        center();
      }
    };
    document.addEventListener("keydown", onKeyDown, { capture: true });

    // Start drift if requested.
    setDrift(driftOn);

    return {
      center,
      nudge,
      setDrift,
      get drift() {
        return driftOn;
      },
      destroy() {
        setDrift(false);
        scroller.removeEventListener("scroll", onScroll);
        document.removeEventListener("keydown", onKeyDown, true);
        if (ro) ro.disconnect();
      },
    };
  }

  function autoWire(controller) {
    const toggle = document.querySelector("[data-torus-toggle]");
    const centerBtn = document.querySelector("[data-torus-center]");

    function setToggleUI(on) {
      if (!(toggle instanceof HTMLButtonElement)) return;
      toggle.setAttribute("aria-pressed", on ? "true" : "false");
      toggle.textContent = on ? "dérive: 1" : "dérive: 0";
    }

    if (toggle) {
      setToggleUI(controller.drift);
      toggle.addEventListener("click", () => {
        controller.setDrift(!controller.drift);
        setToggleUI(controller.drift);
      });
    }

    if (centerBtn) {
      centerBtn.addEventListener("click", () => controller.center());
    }
  }

  function boot() {
    const torusEl = document.querySelector("[data-torus]");
    if (!(torusEl instanceof HTMLElement)) return;

    const ctrl = initTorus(torusEl, {
      drift: torusEl.getAttribute("data-torus-drift") === "1",
      keys: torusEl.getAttribute("data-torus-keys") === "1",
    });

    autoWire(ctrl);

    window.O = window.O || {};
    window.O.torus = window.O.torus || {};
    window.O.torus.center = ctrl.center;
    window.O.torus.setDrift = ctrl.setDrift;
    window.O.torus.nudge = ctrl.nudge;
  }

  boot();
})();
