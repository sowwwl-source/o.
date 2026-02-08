import { obfuscateText } from '../social/readability';

type OverlayElements = {
  root: HTMLDivElement;
  hud: HTMLDivElement;
  title: HTMLDivElement;
  stats: HTMLDivElement;
  focus: HTMLDivElement;
  stability: HTMLDivElement;
  stabilityBar: HTMLDivElement;
  audio: HTMLButtonElement;
  panel: HTMLDivElement;
  panelTitle: HTMLDivElement;
  panelBody: HTMLPreElement;
  panelActions: HTMLDivElement;
};

export type OverlayPanel = {
  title: string;
  body: string;
  actions: Array<{ id: string; label: string }>;
};

export type OverlayAPI = {
  el: OverlayElements;
  setStability(value: number): void;
  setStats(text: string): void;
  setFocus(text: string, stability: number, seed: number): void;
  setPanel(panel: OverlayPanel | null): void;
  onAction(cb: (id: string) => void): void;
  onAudioToggle(cb: () => void): void;
  setAudioState(on: boolean): void;
};

function css() {
  return `
  .o3d-overlay{
    position: fixed;
    inset: 0;
    pointer-events: none;
    color: var(--fg);
  }
  .o3d-hud{
    position: absolute;
    left: 14px;
    top: 14px;
    max-width: min(520px, calc(100vw - 28px));
    pointer-events: auto;
    user-select: none;
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 12px 12px 10px;
    background: rgba(3, 4, 5, 0.38);
    backdrop-filter: blur(10px);
  }
  .o3d-title{
    display:flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.9;
    margin-bottom: 10px;
  }
  .o3d-audio{
    font: inherit;
    color: inherit;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: transparent;
    padding: 6px 10px;
    cursor: pointer;
  }
  .o3d-audio:hover{ background: rgba(238,232,221,0.08); }
  .o3d-row{
    display:flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
    font-size: 12px;
    opacity: 0.86;
  }
  .o3d-stability{
    display:flex;
    gap: 10px;
    align-items: center;
  }
  .o3d-bar{
    width: 140px;
    height: 8px;
    border-radius: 999px;
    border: 1px solid var(--line);
    overflow: hidden;
    opacity: 0.9;
  }
  .o3d-bar > div{
    height: 100%;
    width: 0%;
    background: var(--accent);
    opacity: 0.75;
  }
  .o3d-panel{
    position: absolute;
    right: 14px;
    bottom: 14px;
    max-width: min(520px, calc(100vw - 28px));
    pointer-events: auto;
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 12px;
    background: rgba(3, 4, 5, 0.44);
    backdrop-filter: blur(10px);
    display: none;
  }
  .o3d-panel h3{
    margin: 0 0 8px 0;
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.9;
  }
  .o3d-panel pre{
    margin: 0;
    white-space: pre-wrap;
    font-size: 12px;
    line-height: 1.35;
    opacity: 0.88;
  }
  .o3d-actions{
    margin-top: 10px;
    display:flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .o3d-actions button{
    font: inherit;
    color: inherit;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: transparent;
    padding: 7px 10px;
    cursor: pointer;
  }
  .o3d-actions button:hover{
    background: rgba(238,232,221,0.08);
  }
  `;
}

export function createOverlay(mount: HTMLElement): OverlayAPI {
  const style = document.createElement('style');
  style.textContent = css();
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'o3d-overlay';

  const hud = document.createElement('div');
  hud.className = 'o3d-hud';

  const title = document.createElement('div');
  title.className = 'o3d-title';
  title.textContent = 'D0RS / COUR / SALOON';

  const audio = document.createElement('button');
  audio.className = 'o3d-audio';
  audio.type = 'button';
  audio.textContent = 'audio: off';

  title.appendChild(audio);

  const stats = document.createElement('div');
  stats.className = 'o3d-row';
  stats.textContent = '—';

  const focus = document.createElement('div');
  focus.className = 'o3d-row';
  focus.textContent = '—';

  const stability = document.createElement('div');
  stability.className = 'o3d-row o3d-stability';
  const stabilityText = document.createElement('div');
  stabilityText.textContent = 'S: —';
  const bar = document.createElement('div');
  bar.className = 'o3d-bar';
  const barIn = document.createElement('div');
  bar.appendChild(barIn);
  stability.appendChild(stabilityText);
  stability.appendChild(bar);

  hud.appendChild(title);
  hud.appendChild(stats);
  hud.appendChild(focus);
  hud.appendChild(stability);

  const panel = document.createElement('div');
  panel.className = 'o3d-panel';
  const panelTitle = document.createElement('h3');
  const panelBody = document.createElement('pre');
  const panelActions = document.createElement('div');
  panelActions.className = 'o3d-actions';
  panel.appendChild(panelTitle);
  panel.appendChild(panelBody);
  panel.appendChild(panelActions);

  root.appendChild(hud);
  root.appendChild(panel);
  mount.appendChild(root);

  let actionCb: (id: string) => void = () => {};
  let audioCb: () => void = () => {};

  audio.addEventListener('click', (e) => {
    e.preventDefault();
    audioCb();
  });

  return {
    el: {
      root,
      hud,
      title,
      stats,
      focus,
      stability: stabilityText,
      stabilityBar: barIn,
      audio,
      panel,
      panelTitle,
      panelBody,
      panelActions,
    },
    setStability(value) {
      const v = Math.max(0, Math.min(1, value));
      stabilityText.textContent = `S: ${v.toFixed(2)}`;
      barIn.style.width = `${Math.round(v * 100)}%`;
    },
    setStats(text) {
      stats.textContent = text || '—';
    },
    setFocus(text, s, seed) {
      focus.textContent = obfuscateText(text || '—', s, performance.now(), seed);
    },
    setPanel(p) {
      if (!p) {
        panel.style.display = 'none';
        panelTitle.textContent = '';
        panelBody.textContent = '';
        panelActions.textContent = '';
        return;
      }

      panel.style.display = 'block';
      panelTitle.textContent = p.title;
      panelBody.textContent = p.body;
      panelActions.textContent = '';
      p.actions.forEach((a) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = a.label;
        b.addEventListener('click', () => actionCb(a.id));
        panelActions.appendChild(b);
      });
    },
    onAction(cb) {
      actionCb = cb;
    },
    onAudioToggle(cb) {
      audioCb = cb;
    },
    setAudioState(on) {
      audio.textContent = on ? 'audio: on' : 'audio: off';
    },
  };
}

