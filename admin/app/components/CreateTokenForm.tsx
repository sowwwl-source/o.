"use client";

import { useActionState } from "react";
import { createTokenAction } from "../actions";

type Props = {
  familyId: string;
};

export function CreateTokenForm(props: Props) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { ok?: boolean; secret?: string; tokenId?: string; error?: string } | null, formData: FormData) => {
      try {
        const r = await createTokenAction(formData);
        return { ok: true, secret: r.token.secret, tokenId: r.token.id };
      } catch (e) {
        return { ok: false, error: String((e as any)?.message ?? e) };
      }
    },
    null,
  );

  return (
    <div className="grid" aria-label="Create token">
      <form action={formAction} className="grid">
        <input type="hidden" name="familyId" value={props.familyId} />
        <div className="row">
          <div className="muted">token label</div>
          <input name="label" placeholder="laptop" />
        </div>
        <div className="actions">
          <button className="cmd" type="submit" disabled={pending}>
            {pending ? "…" : "create token"}
          </button>
        </div>
      </form>

      {state?.ok && (
        <div className="line mono">
          token: {state.tokenId}
          {"\n"}secret (show once): {state.secret}
        </div>
      )}
      {state && state.ok === false && <div className="line muted">error: {state.error}</div>}
    </div>
  );
}

