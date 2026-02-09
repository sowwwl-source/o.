"use server";

import { revalidatePath } from "next/cache";

type BackendConfig = { backendUrl: string; adminToken: string };

function backend(): BackendConfig {
  const backendUrl = process.env.O_BACKEND_URL ?? "";
  const adminToken = process.env.O_ADMIN_API_TOKEN ?? "";
  if (!backendUrl) throw new Error("Missing O_BACKEND_URL");
  if (!adminToken) throw new Error("Missing O_ADMIN_API_TOKEN");
  return { backendUrl: backendUrl.replace(/\/+$/, ""), adminToken };
}

async function api<T>(method: string, p: string, body?: unknown): Promise<T> {
  const { backendUrl, adminToken } = backend();
  const r = await fetch(`${backendUrl}${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const j = (await r.json().catch(() => null)) as any;
  if (!r.ok || !j?.ok) throw new Error(j?.error || "request_failed");
  return j as T;
}

export async function createFamilyAction(formData: FormData) {
  const label = String(formData.get("label") ?? "").trim();
  const principalsRaw = String(formData.get("principals") ?? "").trim();
  const principals = principalsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  await api("POST", "/families", { label, principals });
  revalidatePath("/");
}

export async function createTokenAction(formData: FormData) {
  const familyId = String(formData.get("familyId") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const r = await api<{ ok: true; token: { id: string; familyId: string; label: string | null; secret: string } }>(
    "POST",
    `/families/${encodeURIComponent(familyId)}/tokens`,
    { label },
  );
  revalidatePath("/");
  return r;
}

export async function rotateTokenAction(formData: FormData) {
  const tokenId = String(formData.get("tokenId") ?? "").trim();
  const r = await api<{ ok: true; token: { id: string; secret: string } }>(
    "POST",
    `/tokens/${encodeURIComponent(tokenId)}/rotate`,
    {},
  );
  revalidatePath("/");
  return r;
}

export async function revokeTokenAction(formData: FormData) {
  const tokenId = String(formData.get("tokenId") ?? "").trim();
  await api("POST", `/tokens/${encodeURIComponent(tokenId)}/revoke`, {});
  revalidatePath("/");
}

export async function loadData() {
  const families = await api<{ ok: true; families: any[] }>("GET", "/families");
  const tokens = await api<{ ok: true; tokens: any[] }>("GET", "/tokens");
  return { families: families.families, tokens: tokens.tokens };
}
