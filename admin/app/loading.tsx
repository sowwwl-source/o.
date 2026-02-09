export default function Loading() {
  return (
    <div className="wrap">
      <pre aria-hidden="true">
        {`┌────────────────────────────┐
│  O  ssh-ca   admin          │
│                            │
│  …                           │
└────────────────────────────┘`}
      </pre>
      <div className="line muted">loading</div>
    </div>
  );
}

