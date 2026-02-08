import { useEffect, useState } from "react";
import { uzyxFooterAPI, type UzyxState } from "@/uzyx";

export function useUzyxState(): UzyxState {
  const [state, setState] = useState<UzyxState>(() => uzyxFooterAPI.getUzyxState());

  useEffect(() => uzyxFooterAPI.subscribe(setState), []);

  return state;
}

