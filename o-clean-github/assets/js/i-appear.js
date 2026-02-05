/* i appear / disappear — multi-block */
(() => {
  const CFG = {
    tickMs: 90,
    emaAlpha: 0.18,
    disappearPow: 2.2,
    scrollPxPerSecMax: 5200,
    pointerPxPerSecMax: 2400,
    wheelPerSecMax: 70,
    maxEraseRatio: 0.94,
    layers: {
      noise:  { start: 0.05, span: 0.55 },
      body:   { start: 0.18, span: 0.65 },
      detail: { start: 0.42, span: 0.75 },
      truth:  { start: 2.00, span: 1.00 }
    },
    quietSecondsRequired: 6.5
  };

  // RNG stable
  function xmur3(str){let h=1779033703^str.length;for(let i=0;i<str.length;i++){h=Math.imul(h^str.charCodeAt(i),3432918353);h=(h<<13)|(h>>>19);}return()=>{h=Math.imul(h^(h>>>16),2246822507);h=Math.imul(h^(h>>>13),3266489909);return(h^=h>>>16)>>>0;};}
  function sfc32(a,b,c,d){return()=>{a>>>=0;b>>>=0;c>>>=0;d>>>=0;let t=(a+b)|0;a=b^(b>>>9);b=(c+(c<<3))|0;c=(c<<21)|(c>>>11);d=(d+1)|0;t=(t+d)|0;c=(c+t)|0;return(t>>>0)/4294967296;};}
  const seedGen=xmur3(String(Date.now())+"|"+navigator.userAgent);
  const rand=sfc32(seedGen(),seedGen(),seedGen(),seedGen());

  const state = {
    lastScrollY: window.scrollY,
    lastScrollT: performance.now(),
    scrollVel: 0,
    pointerVel: 0,
    wheelRate: 0,
    wheelCount: 0,
    wheelCountT0: performance.now(),
    lastPx: null, lastPy: null, lastPt: null,
    avi: 0,
    quietSeconds: 0,
    orangeDone: false
  };

  const clamp01 = x => x < 0 ? 0 : (x > 1 ? 1 : x);
  const ema = (p,n,a)=> p + a*(n-p);

  window.addEventListener("scroll", () => {
    const now=performance.now(), y=window.scrollY;
    const dt=Math.max(1, now-state.lastScrollT), dy=Math.abs(y-state.lastScrollY);
    const inst=(dy/dt)*1000;
    state.scrollVel=ema(state.scrollVel,inst,CFG.emaAlpha);
    state.lastScrollY=y; state.lastScrollT=now;
  }, {passive:true});

  window.addEventListener("pointermove",(e)=>{
    const now=performance.now(), x=e.clientX, y=e.clientY;
    if(state.lastPt!=null){
      const dt=Math.max(1, now-state.lastPt);
      const dx=x-state.lastPx, dy=y-state.lastPy;
      const dist=Math.sqrt(dx*dx+dy*dy);
      const inst=(dist/dt)*1000;
      state.pointerVel=ema(state.pointerVel,inst,CFG.emaAlpha);
    }
    state.lastPx=x; state.lastPy=y; state.lastPt=now;
  }, {passive:true});

  window.addEventListener("wheel",()=>{
    state.wheelCount++;
    const now=performance.now(), dt=now-state.wheelCountT0;
    if(dt>=250){
      const rate=(state.wheelCount/dt)*1000;
      state.wheelRate=ema(state.wheelRate,rate,CFG.emaAlpha);
      state.wheelCount=0; state.wheelCountT0=now;
    }
  }, {passive:true});

  function computeAVI(){
    const s=clamp01(state.scrollVel/CFG.scrollPxPerSecMax);
    const p=clamp01(state.pointerVel/CFG.pointerPxPerSecMax);
    const w=clamp01(state.wheelRate/CFG.wheelPerSecMax);
    const inst=clamp01(0.55*s+0.30*p+0.15*w);
    state.avi=clamp01(Math.pow(inst,0.85));
    return state.avi;
  }

  function targetEraseRatioFromAVI(avi){
    const t=Math.pow(avi,CFG.disappearPow);
    return clamp01(t*CFG.maxEraseRatio);
  }

  function layerEraseRatio(globalErase, layer){
    const x = (globalErase - layer.start) / Math.max(1e-6, layer.span);
    return clamp01(x);
  }

  // prepare blocks (wrap text nodes -> spans)
  const blocks = Array.from(document.querySelectorAll(".i-block"));
  if (!blocks.length) return;

  const prepared = blocks.map((el) => {
    const type = (el.dataset.i || "body").toLowerCase();
    const layer = CFG.layers[type] || CFG.layers.body;

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    while(walker.nextNode()) textNodes.push(walker.currentNode);

    const spans = [];
    const thresholds = [];
    textNodes.forEach(node=>{
      const txt = node.nodeValue || "";
      const frag = document.createDocumentFragment();
      for(const ch of Array.from(txt)){
        if(ch === "\n"){ frag.appendChild(document.createTextNode("\n")); continue; }
        const sp = document.createElement("span");
        sp.textContent = ch;
        frag.appendChild(sp);
        spans.push(sp);
        thresholds.push(rand());
      }
      node.parentNode.replaceChild(frag, node);
    });

    return { el, type, layer, spans, thresholds };
  });

  // Orange O rare (in detail)
  function maybeArmOrange(dtSec){
    if(state.avi <= 0.08) state.quietSeconds += dtSec;
    else state.quietSeconds = Math.max(0, state.quietSeconds - dtSec*1.6);

    if(state.orangeDone) return;
    if(state.quietSeconds < CFG.quietSecondsRequired) return;

    const detailBlocks = prepared.filter(b => b.type === "detail");
    const candidates = [];
    detailBlocks.forEach(b=>{
      b.spans.forEach((sp) => { if (sp.textContent === "O") candidates.push(sp); });
    });

    const href = (rand() < 0.80) ? "/sal00ns.php" : (rand() < 0.95 ? "/p0sts.php" : "/x.php");
    const chosen = candidates.length ? candidates[Math.floor(rand()*candidates.length)] : null;
    if (!chosen) return;

    chosen.classList.add("i-orange");
    chosen.style.cursor = "pointer";
    chosen.addEventListener("click", () => { window.location.href = href; }, { once:true });
    state.orangeDone = true;
  }

  let lastTick = performance.now();
  function tick(){
    const now = performance.now();
    const dt = Math.max(1, now-lastTick); lastTick = now;

    computeAVI();
    const globalErase = targetEraseRatioFromAVI(state.avi);

    prepared.forEach(b=>{
      const r = layerEraseRatio(globalErase, b.layer);
      for(let i=0;i<b.spans.length;i++){
        const keep = b.thresholds[i] > r;
        b.spans[i].classList.toggle("i-ghost", !keep);
      }
    });

    maybeArmOrange(dt/1000);
    setTimeout(tick, CFG.tickMs);
  }
  tick();
})();
