import React, { useEffect, useRef } from "react";
import "./land.css";
import { HautPoint } from "@/components/HautPoint";
import { usePerceptionStore } from "@/perception/PerceptionProvider";

export function LandPage() {
  const store = usePerceptionStore();
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    store.setBaseProfile("land");
  }, [store]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    return store.subscribe(() => {
      const m = store.getFrame().nodes.LAND;
      if (!m) return;
      el.style.setProperty("--scale-x", String(m.typo.scaleX.toFixed(3)));
      el.style.setProperty("--scale-y", String(m.typo.scaleY.toFixed(3)));
      el.style.setProperty("--skew", `${m.typo.skewDeg.toFixed(2)}deg`);
      el.style.setProperty("--blur-orient", `${m.blur.orient.toFixed(2)}px`);
      el.style.setProperty("--blur-depth", `${m.blur.depth.toFixed(2)}px`);
      el.style.setProperty("--blur-threshold", `${m.blur.threshold.toFixed(2)}px`);
      el.style.setProperty("--blur-ox", `${m.blur.ox.toFixed(2)}px`);
      el.style.setProperty("--blur-oy", `${m.blur.oy.toFixed(2)}px`);
    });
  }, [store]);

  const onHautHoldStill = () => {
    if (store.getFrame().pointer.speed > 220) return;
    store.toggleDeltaZ();
  };

  return (
    <main ref={rootRef} className="landRoot" aria-label="LAND">
      <HautPoint href="#/HAUT" label="Haut Point" onHoldStill={onHautHoldStill} />
      <div className="landHint" aria-hidden="true">
        LAND
      </div>
    </main>
  );
}

