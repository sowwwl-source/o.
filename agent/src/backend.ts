export type IssueCertResponse = {
  ok: true;
  certificate: string;
  caPublicKey: string;
  principals: string[];
  validUntil: number;
  requestId: string;
};

export async function issueCert(args: { backendUrl: string; tokenId: string; tokenSecret: string; publicKey: string }) {
  const r = await fetch(`${args.backendUrl}/tokens/${encodeURIComponent(args.tokenId)}/issue-cert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.tokenSecret}`,
    },
    body: JSON.stringify({ publicKey: args.publicKey }),
  });
  const j = (await r.json().catch(() => null)) as any;
  if (!r.ok) {
    const code = typeof j?.error === "string" ? j.error : "request_failed";
    throw new Error(code);
  }
  return j as IssueCertResponse;
}

