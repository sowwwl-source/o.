import type { Request } from "express";
import { randomUUID } from "node:crypto";

export function getRequestId(req: Request): string {
  const existing = req.headers["x-request-id"];
  if (typeof existing === "string" && existing.trim()) return existing.trim();
  return randomUUID();
}

export function getBearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const m = /^Bearer\s+(.+)\s*$/i.exec(h);
  return m ? m[1]!.trim() : null;
}
