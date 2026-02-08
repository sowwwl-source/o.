import React, { useContext, useEffect, useRef, useSyncExternalStore } from "react";
import "./perception.css";
import { PerceptionStore } from "./perceptionStore";

const Ctx = React.createContext<PerceptionStore | null>(null);

export function PerceptionProvider(props: { children: React.ReactNode }) {
  const storeRef = useRef<PerceptionStore | null>(null);
  if (!storeRef.current) storeRef.current = new PerceptionStore();

  useEffect(() => {
    storeRef.current?.start();
    return () => storeRef.current?.stop();
  }, []);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    storeRef.current?.setCanvas(canvasRef.current);
    return () => storeRef.current?.setCanvas(null);
  }, []);

  return (
    <Ctx.Provider value={storeRef.current}>
      {props.children}
      <canvas ref={canvasRef} className="perceptionCanvas" aria-hidden="true" />
    </Ctx.Provider>
  );
}

export function usePerceptionStore(): PerceptionStore {
  const s = useContext(Ctx);
  if (!s) throw new Error("PerceptionStore missing (wrap with <PerceptionProvider/>)");
  return s;
}

export function usePerceptionFrame() {
  const s = usePerceptionStore();
  return useSyncExternalStore(s.subscribe.bind(s), s.getFrame.bind(s), s.getFrame.bind(s));
}

