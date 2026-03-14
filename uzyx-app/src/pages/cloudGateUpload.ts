import { zipSync } from "fflate";

export type SoulFileDescriptor = {
  name: string;
  path: string;
  bytes: number;
  type: string | null;
};

export type SoulManifest = {
  kind: "soul_upload";
  created_at: string;
  principal_id: string | null;
  cloud: string | null;
  token_hint: string | null;
  note: string | null;
  file_count: number;
  files: SoulFileDescriptor[];
};

export type PreparedSoulArchive = {
  archive: File;
  bundled: boolean;
  files: SoulFileDescriptor[];
};

async function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") {
    return new Uint8Array(await file.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
    reader.readAsArrayBuffer(file);
  });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function rawFilePath(file: File): string {
  const rel = "webkitRelativePath" in file ? String((file as File & { webkitRelativePath?: string }).webkitRelativePath || "") : "";
  return rel || file.name || "file";
}

function sanitizeSoulPath(path: string): string {
  const parts = String(path || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.replace(/\0/g, "").trim())
    .filter(Boolean)
    .map((part) => {
      if (part === "." || part === "..") return "_";
      return part.slice(0, 180) || "_";
    });

  return parts.length ? parts.join("/") : "file";
}

function withSuffix(path: string, n: number): string {
  const slash = path.lastIndexOf("/");
  const dir = slash >= 0 ? path.slice(0, slash + 1) : "";
  const base = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = base.lastIndexOf(".");

  if (dot > 0) {
    return `${dir}${base.slice(0, dot)}-${n}${base.slice(dot)}`;
  }
  return `${dir}${base}-${n}`;
}

function uniqueSoulPath(path: string, used: Set<string>): string {
  let next = path;
  let n = 2;
  while (used.has(next)) {
    next = withSuffix(path, n);
    n += 1;
  }
  used.add(next);
  return next;
}

export function describeSoulFiles(files: readonly File[]): SoulFileDescriptor[] {
  const used = new Set<string>();

  return files.map((file) => {
    const path = uniqueSoulPath(sanitizeSoulPath(rawFilePath(file)), used);
    return {
      name: file.name || path,
      path,
      bytes: file.size,
      type: file.type || null,
    };
  });
}

export function isZipFile(file: File): boolean {
  const name = String(file.name || "");
  const type = String(file.type || "");
  return /\.zip$/i.test(name) || type === "application/zip" || type === "application/x-zip-compressed";
}

export function buildSoulArchiveName(now = new Date()): string {
  const stamp = now
    .toISOString()
    .replace(/[:-]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return `soul-bundle-${stamp}.zip`;
}

export function buildSoulManifest(input: {
  files: readonly File[];
  note?: string;
  principalId?: string | null;
  cloud?: string | null;
  tokenHint?: string | null;
}): SoulManifest {
  const files = describeSoulFiles(input.files);
  const note = String(input.note || "").trim();

  return {
    kind: "soul_upload",
    created_at: new Date().toISOString(),
    principal_id: input.principalId ?? null,
    cloud: input.cloud ?? null,
    token_hint: input.tokenHint ?? null,
    note: note || null,
    file_count: files.length,
    files,
  };
}

export async function prepareSoulArchive(files: readonly File[], name = buildSoulArchiveName()): Promise<PreparedSoulArchive> {
  if (files.length === 0) {
    throw new Error("missing_files");
  }

  const described = describeSoulFiles(files);
  if (files.length === 1 && isZipFile(files[0])) {
    return {
      archive: files[0],
      bundled: false,
      files: described,
    };
  }

  const entries: Record<string, Uint8Array> = {};
  for (let i = 0; i < files.length; i += 1) {
    entries[described[i].path] = await readFileBytes(files[i]);
  }

  const archiveBytes = zipSync(entries, { level: 6 });
  const archiveBuffer = toArrayBuffer(archiveBytes);
  return {
    archive: new File([archiveBuffer], name, {
      type: "application/zip",
      lastModified: Date.now(),
    }),
    bundled: true,
    files: described,
  };
}
