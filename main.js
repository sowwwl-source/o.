/* O manifesto kernel */
const SYSTEM = { mode: 'silent' };

(() => {
  const STORAGE_KEY = 'sowl_inverted';
  const CLASS_NAME = 'inverted';

  function applyState() {
    const isInverted = sessionStorage.getItem(STORAGE_KEY) === '1';
    document.body.classList.toggle(CLASS_NAME, isInverted);
  }

  function toggleState() {
    const isInverted = sessionStorage.getItem(STORAGE_KEY) === '1';
    sessionStorage.setItem(STORAGE_KEY, isInverted ? '0' : '1');
  }

  function shouldToggleForLink(link, event) {
    if (!link) return false;
    if (link.target === '_blank') return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (link.hasAttribute('data-no-invert')) return false;

    try {
      const url = new URL(link.href, window.location.href);
      return url.origin === window.location.origin;
    } catch {
      return false;
    }
  }

  document.addEventListener('DOMContentLoaded', applyState);

  let navigating = false;

  function playTransition(x, y) {
    const overlay = document.createElement('div');
    overlay.className = 'sowl-transition';
    overlay.style.setProperty('--transition-x', `${x}px`);
    overlay.style.setProperty('--transition-y', `${y}px`);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.classList.add('is-active');
    });

    return overlay;
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (shouldToggleForLink(link, event)) {
      event.preventDefault();
      if (navigating) {
        return;
      }
      navigating = true;

      const rect = document.body.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;

      playTransition(clickX, clickY);
      toggleState();

      window.setTimeout(() => {
        window.location.href = link.href;
      }, 520);
    }
  });
})();

(() => {
  const mapEl = document.getElementById('map');
  if (!mapEl || typeof L === 'undefined') return;

  const toggleBtn = document.getElementById('toggle-map');
  const starCanvas = document.getElementById('starfield');
  if (!toggleBtn || !starCanvas) return;

  const MAP_VISIBILITY_KEY = 'sowl_map_visible';
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const map = L.map('map', {
    zoomControl: true,
    worldCopyJump: true
  }).setView([20, 0], 2);

  const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const starCtx = starCanvas.getContext('2d');
  const stars = [];
  const STAR_COUNT = 280;
  let pulse = 0;
  let pulseCenter = { x: 0, y: 0 };
  let lastTime = 0;
  let animationId = null;
  let isAnimating = false;

  let mapVisible = localStorage.getItem(MAP_VISIBILITY_KEY) === '1';
  mapEl.classList.toggle('map-visible', mapVisible);
  tiles.setOpacity(mapVisible ? 1 : 0.12);
  toggleBtn.textContent = mapVisible ? 'Masquer la carte' : 'Afficher la carte';

  toggleBtn.addEventListener('click', () => {
    mapVisible = !mapVisible;
    localStorage.setItem(MAP_VISIBILITY_KEY, mapVisible ? '1' : '0');
    mapEl.classList.toggle('map-visible', mapVisible);
    tiles.setOpacity(mapVisible ? 1 : 0.12);
    toggleBtn.textContent = mapVisible ? 'Masquer la carte' : 'Afficher la carte';
  });

  function gaussianRandom() {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  function createStar(width, height) {
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      r: 0.4 + Math.random() * 1.6,
      alpha: 0.35 + Math.random() * 0.65,
      tw: Math.random() * Math.PI * 2,
      vx: (Math.random() - 0.5) * 0.06,
      vy: (Math.random() - 0.5) * 0.06,
      depth: 0.5 + Math.random() * 1.5
    };
  }

  function resizeStarfield() {
    const rect = mapEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    starCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
    starCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
    starCanvas.style.width = `${rect.width}px`;
    starCanvas.style.height = `${rect.height}px`;
    starCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars.length = 0;
    for (let i = 0; i < STAR_COUNT; i += 1) {
      stars.push(createStar(rect.width, rect.height));
    }
  }

  function drawFrame(time) {
    const width = mapEl.clientWidth;
    const height = mapEl.clientHeight;
    if (!width || !height) {
      return;
    }

    const dt = Math.min(32, time - lastTime);
    lastTime = time;
    starCtx.clearRect(0, 0, width, height);

    pulse = Math.max(0, pulse - dt * 0.0011);
    const centerX = pulseCenter.x;
    const centerY = pulseCenter.y;
    for (const star of stars) {
      if (pulse > 0) {
        const dx = centerX - star.x;
        const dy = centerY - star.y;
        const dist = Math.hypot(dx, dy) + 0.001;
        const dirX = dx / dist;
        const dirY = dy / dist;
        const gaussian = Math.abs(gaussianRandom());
        const falloff = 1 - Math.min(dist / (Math.min(width, height) * 0.75), 1);
        const speed = (0.4 + gaussian) * falloff * pulse * 2.6;
        star.vx += dirX * speed * (0.5 + star.depth);
        star.vy += dirY * speed * (0.5 + star.depth);
      }

      star.x += star.vx * (dt / 16);
      star.y += star.vy * (dt / 16);

      star.vx *= 0.99;
      star.vy *= 0.99;

      if (star.x < -10) star.x = width + 10;
      if (star.x > width + 10) star.x = -10;
      if (star.y < -10) star.y = height + 10;
      if (star.y > height + 10) star.y = -10;

      const twinkle = 0.6 + 0.4 * Math.sin(time * 0.002 + star.tw);
      const alpha = Math.min(1, star.alpha * twinkle + pulse * 0.12);
      const radius = star.r * (1 + pulse * 0.25);

      starCtx.beginPath();
      starCtx.fillStyle = `rgba(235, 242, 255, ${alpha})`;
      starCtx.arc(star.x, star.y, radius, 0, Math.PI * 2);
      starCtx.fill();
    }
  }

  function updateStarfield(time) {
    if (!isAnimating) return;
    drawFrame(time);
    animationId = requestAnimationFrame(updateStarfield);
  }

  function startAnimation() {
    if (isAnimating) return;
    isAnimating = true;
    lastTime = performance.now();
    animationId = requestAnimationFrame(updateStarfield);
  }

  function stopAnimation() {
    if (!isAnimating) return;
    isAnimating = false;
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  function handleVisibilityChange() {
    if (document.hidden || prefersReducedMotion.matches) {
      stopAnimation();
      drawFrame(performance.now());
      return;
    }
    startAnimation();
  }

  mapEl.addEventListener('click', (event) => {
    const rect = mapEl.getBoundingClientRect();
    pulseCenter = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    pulse = Math.min(1.4, pulse + 1.2);
    if (!isAnimating && !prefersReducedMotion.matches && !document.hidden) {
      startAnimation();
    } else if (prefersReducedMotion.matches) {
      drawFrame(performance.now());
    }
  });

  window.addEventListener('resize', resizeStarfield);
  prefersReducedMotion.addEventListener('change', handleVisibilityChange);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  resizeStarfield();
  handleVisibilityChange();
})();
