// AZA speaks if user is idle 11s on the same page and document is visible.
// Any user action stops voice immediately and resets the idle timer.

export type Idle11Options = {
  onIdle: () => void;
  onActive: () => void;
};

export function createIdle11s(opts: Idle11Options): () => void {
  const { onIdle, onActive } = opts;

  let t: number | null = null;
  let armed = false;

  const clear = () => {
    if (t !== null) {
      window.clearTimeout(t);
      t = null;
    }
  };

  const reset = () => {
    if (document.visibilityState !== "visible") return;
    clear();
    if (armed) {
      armed = false;
      onActive();
    }
    t = window.setTimeout(() => {
      armed = true;
      onIdle();
    }, 11000);
  };

  const hardStop = () => {
    clear();
    if (armed) armed = false;
    onActive();
  };

  const events: Array<keyof WindowEventMap> = [
    "pointerdown",
    "click",
    "keydown",
    "wheel",
    "scroll",
    "touchstart",
  ];

  const handler = () => reset();
  const add = () => {
    events.forEach((e) =>
      window.addEventListener(e, handler, { passive: true } as any)
    );
    // Form inputs (if any)
    window.addEventListener("input", handler as any, { passive: true } as any);
    window.addEventListener("change", handler as any, { passive: true } as any);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") hardStop();
      else reset();
    });

    window.addEventListener("blur", hardStop);
    window.addEventListener("focus", reset);
  };

  const remove = () => {
    events.forEach((e) => window.removeEventListener(e, handler as any));
    window.removeEventListener("input", handler as any);
    window.removeEventListener("change", handler as any);
    window.removeEventListener("blur", hardStop);
    window.removeEventListener("focus", reset);
    clear();
  };

  add();
  reset();

  return remove;
}
