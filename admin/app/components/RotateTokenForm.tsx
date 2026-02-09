"use client";

import { useActionState } from "react";
import { rotateTokenAction } from "../actions";

type Props = {
  tokenId: string;
};

export function RotateTokenForm(props: Props) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { ok?: boolean; secret?: string; error?: string } | null, formData: FormData) => {
      try {
        const r = await rotateTokenAction(formData);
        return { ok: true, secret: r.token.secret };
      } catch (e) {
        return { ok: false, error: String((e as any)?.message ?? e) };
      }
    },
    null,
  );

  return (
    <div className="grid" aria-label={`Rotate token ${props.tokenId}`}>
      <form action={formAction}>
        <input type="hidden" name="tokenId" value={props.tokenId} />
        <button className="cmd" type="submit" disabled={pending}>
          {pending ? "…" : "rotate"}
        </button>
      </form>
      {state?.ok && <div className="line mono">new secret (show once): {state.secret}</div>}
      {state && state.ok === false && <div className="line muted">error: {state.error}</div>}
    </div>
  );
}

