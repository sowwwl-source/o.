"use client";

export default function ErrorPage(props: { error: Error; reset: () => void }) {
  return (
    <div className="wrap">
      <pre aria-hidden="true">
        {`┌────────────────────────────┐
│  O  ssh-ca   admin          │
│                            │
│  error                      │
└────────────────────────────┘`}
      </pre>
      <div className="line muted">A server-side env/config is missing or backend is unreachable.</div>
      <div style={{ height: 10 }} />
      <div className="line mono">{String(props.error?.message ?? props.error)}</div>
      <div style={{ height: 14 }} />
      <div className="actions">
        <button className="cmd" type="button" onClick={() => props.reset()}>
          retry
        </button>
      </div>
    </div>
  );
}

