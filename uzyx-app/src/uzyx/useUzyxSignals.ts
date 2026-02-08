import { useEffect } from "react";
import { uzyxFooterAPI } from "@/uzyx";

export function useUzyxSignals() {
  useEffect(() => {
    const onCreatePort = () => {
      uzyxFooterAPI.setUzyxState({ towardO: true, unstable: false });
    };

    const onFirstEditB0te = () => {
      uzyxFooterAPI.setUzyxState({ towardO: true });
    };

    window.addEventListener("uzyx:create:port", onCreatePort);
    window.addEventListener("uzyx:edit:first_b0te", onFirstEditB0te);

    return () => {
      window.removeEventListener("uzyx:create:port", onCreatePort);
      window.removeEventListener("uzyx:edit:first_b0te", onFirstEditB0te);
    };
  }, []);
}

