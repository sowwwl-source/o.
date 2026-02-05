/* B(o)Té — ASCII live editor + scan O vert + negative si orange détecté */
(() => {
  const ta = document.getElementById("src");
  const view = document.getElementById("view");
  const overlay = document.getElementById("scanOverlay");
  const btnOrange = document.getElementById("btnOrange");
  const btnSave = document.getElementById("btnSave");
  const status = document.getElementById("status");

  if (!ta || !view || !overlay) return;

  // Orange markers
  const L = "⟦";
  const R = "⟧";

  function escapeHtml(s){
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // Render: segments inside ⟦ ⟧ are orange (markers kept visible but subdued)
  function render() {
    const src = ta.value;
    let out = "";
    let i = 0;
    let inOrange = false;
    while (i < src.length) {
      const ch = src[i];
      if (ch === L) { inOrange = true; out += `<span class="muted">${escapeHtml(ch)}</span>`; i++; continue; }
      if (ch === R) { inOrange = false; out += `<span class="muted">${escapeHtml(ch)}</span>`; i++; continue; }
      if (ch === "\n") { out += "\n"; i++; continue; }
      if (inOrange) out += `<span class="i-orange i-orange-token">${escapeHtml(ch)}</span>`;
      else out += escapeHtml(ch);
      i++;
    }
    view.innerHTML = out;

    // after render, evaluate scan
    requestAnimationFrame(checkOrangeUnderScan);
  }

  // Wrap selection in markers
  function toggleOrange() {
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    if (end <= start) return;

    const before = ta.value.slice(0, start);
    const sel = ta.value.slice(start, end);
    const after = ta.value.slice(end);

    // naive: always wrap (no unwrap logic)
    ta.value = before + L + sel + R + after;

    // restore selection approximately inside wrapped text
    ta.focus();
    ta.selectionStart = start + 1;
    ta.selectionEnd = end + 1;

    render();
  }

  // Scan position: follow pointer (mouse/finger)
  let cx = window.innerWidth * 0.5;
  let cy = window.innerHeight * 0.32;

  function setScan(x, y) {
    cx = x; cy = y;
    overlay.style.setProperty("--cx", `${cx}px`);
    overlay.style.setProperty("--cy", `${cy}px`);
    checkOrangeUnderScan();
  }

  window.addEventListener("pointermove", (e) => setScan(e.clientX, e.clientY), { passive: true });
  // touch fallback
  window.addEventListener("touchmove", (e) => {
    const t = e.touches && e.touches[0];
    if (t) setScan(t.clientX, t.clientY);
  }, { passive: true });

  // Determine if any orange token is under scan donut-ish window (approx circle radius)
  function checkOrangeUnderScan() {
    const radius = 120; // matches overlay ::before 240px
    const tokens = view.querySelectorAll(".i-orange-token");
    let hit = false;

    const scanRect = { x: cx, y: cy, r: radius };
    tokens.forEach(sp => {
      if (hit) return;
      const r = sp.getBoundingClientRect();
      const px = r.left + r.width / 2;
      const py = r.top + r.height / 2;
      const dx = px - scanRect.x;
      const dy = py - scanRect.y;
      if ((dx*dx + dy*dy) <= (scanRect.r * scanRect.r)) hit = true;
    });

    overlay.classList.toggle("negative", hit);
  }

  // Save via fetch POST (same origin)
  async function save() {
    const form = btnSave?.closest("form");
    if (!form) return;
    status.textContent = "saving…";
    try {
      const fd = new FormData(form);
      fd.set("content", ta.value);

      const res = await fetch(form.action, { method: "POST", body: fd, credentials: "same-origin" });
      const txt = await res.text();
      // server responds with JSON
      const j = JSON.parse(txt);
      if (j.ok) status.textContent = "saved";
      else status.textContent = "error: " + (j.error || "unknown");
    } catch (e) {
      status.textContent = "error";
    }
    setTimeout(()=> status.textContent = "", 1200);
  }

  ta.addEventListener("input", render);
  btnOrange?.addEventListener("click", (e)=>{ e.preventDefault(); toggleOrange(); });
  btnSave?.addEventListener("click", (e)=>{ e.preventDefault(); save(); });

  window.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "o" || e.key === "O")) { e.preventDefault(); toggleOrange(); }
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) { e.preventDefault(); save(); }
  });

  // initial
  render();
  setScan(cx, cy);
})();
