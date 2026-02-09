import { createFamilyAction, loadData, revokeTokenAction } from "./actions";
import { CreateTokenForm } from "./components/CreateTokenForm";
import { RotateTokenForm } from "./components/RotateTokenForm";

export const dynamic = "force-dynamic";

function ascii() {
  return `┌────────────────────────────┐
│  O  ssh-ca   admin          │
│                            │
│  .     .    .              │
│     O        .             │
│  .     .        .          │
└────────────────────────────┘`;
}

export default async function Page() {
  const data = await loadData();

  const tokensByFamily = new Map<string, any[]>();
  for (const t of data.tokens) {
    const arr = tokensByFamily.get(t.familyId) ?? [];
    arr.push(t);
    tokensByFamily.set(t.familyId, arr);
  }

  return (
    <div className="wrap">
      <pre aria-hidden="true">{ascii()}</pre>
      <div className="line muted">Provision → issue short-lived certs → revoke / rotate.</div>

      <div style={{ height: 18 }} />

      <div className="grid">
        <section>
          <div className="line">Families</div>
          <div className="line muted">Principals are embedded in user certificates.</div>

          <div style={{ height: 10 }} />

          <form action={createFamilyAction} className="grid" aria-label="Create family">
            <div className="row">
              <div className="muted">label</div>
              <input name="label" required />
            </div>
            <div className="row">
              <div className="muted">principals</div>
              <input name="principals" placeholder="o,ops,..." required />
            </div>
            <div className="actions">
              <button className="cmd" type="submit">
                create
              </button>
            </div>
          </form>
        </section>

        <section>
          <div className="line">Tokens</div>
          <div className="line muted">Secrets are shown only in the action response.</div>
        </section>

        {data.families.map((f: any) => {
          const tokens = tokensByFamily.get(f.id) ?? [];
          return (
            <section key={f.id}>
              <div className="line">{f.label}</div>
              <div className="line muted mono">
                id: {f.id}
                {"\n"}principals: {(f.principals ?? []).join(",")}
              </div>

              <div style={{ height: 10 }} />

              <CreateTokenForm familyId={f.id} />

              <div style={{ height: 12 }} />

              <div className="grid">
                {tokens.map((t: any) => (
                  <div key={t.id} className="grid" style={{ borderTop: "1px solid rgba(231,231,231,.12)", paddingTop: 10 }}>
                    <div className="line mono">
                      token: {t.id}
                      {"\n"}label: {t.label ?? "-"}
                      {"\n"}revokedAt: {t.revokedAt ? new Date(t.revokedAt).toISOString() : "-"}
                      {"\n"}rotatedAt: {t.rotatedAt ? new Date(t.rotatedAt).toISOString() : "-"}
                    </div>
                    <div className="actions">
                      <RotateTokenForm tokenId={t.id} />
                      <form action={revokeTokenAction}>
                        <input type="hidden" name="tokenId" value={t.id} />
                        <button className="cmd" type="submit">
                          revoke
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
