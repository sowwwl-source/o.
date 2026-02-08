import React from "react";
import { HautPoint } from "./HautPoint";

type Props = {
  href?: string;
  onHoldStill?: () => void;
};

export function ODot(props: Props) {
  return <HautPoint href={props.href ?? "#/cloud"} label="O." text=". O." onHoldStill={props.onHoldStill} />;
}

