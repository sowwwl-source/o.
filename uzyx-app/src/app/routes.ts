import type { NodeId } from "@/graph/graph";

export type Route =
  | { kind: "home" }
  | { kind: "entry" }
  | { kind: "anchored" }
  | { kind: "lande_new" }
  | { kind: "admin" }
  | { kind: "admin_magic" }
  | { kind: "app"; id: NodeId }
  | { kind: "profile"; handle: string }
  | { kind: "cloud" };

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function parseRouteFromHash(hash: string): Route {
  const raw = String(hash || "").replace(/^#\/?/, "").replace(/^\/+/, "");
  const parts = raw.split("/").filter(Boolean);
  const head = (parts[0] ?? "").toLowerCase();

  if (raw.trim() === "") return { kind: "home" };
  if (head === "entry") return { kind: "entry" };
  if (head === "anchored") return { kind: "anchored" };
  if (head === "lande" && (parts[1] ?? "").toLowerCase() === "new") return { kind: "lande_new" };
  if (head === "admin" && (parts[1] ?? "").toLowerCase() === "magic") return { kind: "admin_magic" };
  if (head === "admin") return { kind: "admin" };

  if (head === "u" && parts[1]) {
    const handle = safeDecode(parts[1]).replace(/^@+/, "");
    return { kind: "profile", handle };
  }

  if (head === "cloud" || head === "soul" || head === "soul.cloud") return { kind: "cloud" };

  if (head === "app") {
    const k2 = String(parts[1] ?? "").trim().toUpperCase();
    if (k2 === "" || k2 === "HAUT" || k2 === "B0ARD" || k2 === "BOARD") return { kind: "app", id: "HAUT" };
    if (k2 === "LAND") return { kind: "app", id: "LAND" };
    if (k2 === "FERRY") return { kind: "app", id: "FERRY" };
    if (k2 === "STR3M" || k2 === "STR3AM" || k2 === "STREAM") return { kind: "app", id: "STR3M" };
    if (k2 === "CONTACT" || k2 === "CONTACTS") return { kind: "app", id: "CONTACT" };
    return { kind: "app", id: "HAUT" };
  }

  // Back-compat: node ids at the root are treated as "/app/<node>".
  const key = raw.trim().toUpperCase();
  if (key === "HAUT" || key === "B0ARD" || key === "BOARD") return { kind: "app", id: "HAUT" };
  if (key === "LAND") return { kind: "app", id: "LAND" };
  if (key === "FERRY") return { kind: "app", id: "FERRY" };
  if (key === "STR3M" || key === "STR3AM" || key === "STREAM") return { kind: "app", id: "STR3M" };
  if (key === "CONTACT" || key === "CONTACTS") return { kind: "app", id: "CONTACT" };
  return { kind: "home" };
}
