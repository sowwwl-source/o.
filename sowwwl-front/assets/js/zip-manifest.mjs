/* Minimal ZIP central directory scanner (no decompression). */

function u16le(u8, off) {
  return u8[off] | (u8[off + 1] << 8);
}

function u32le(u8, off) {
  return (u8[off] | (u8[off + 1] << 8) | (u8[off + 2] << 16) | (u8[off + 3] << 24)) >>> 0;
}

function findEOCD(u8) {
  const sig0 = 0x50; // P
  const sig1 = 0x4b; // K
  const sig2 = 0x05;
  const sig3 = 0x06;

  const maxBack = Math.min(u8.length, 22 + 65535);
  for (let i = u8.length - 22; i >= u8.length - maxBack; i -= 1) {
    if (i < 0) break;
    if (u8[i] === sig0 && u8[i + 1] === sig1 && u8[i + 2] === sig2 && u8[i + 3] === sig3) return i;
  }
  return -1;
}

function decodeUtf8(u8) {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(u8);
  } catch {
    let s = "";
    for (let i = 0; i < u8.length; i += 1) s += String.fromCharCode(u8[i]);
    return s;
  }
}

export function parseZipCentralDirectory(arrayBuffer, { maxEntries = 8000 } = {}) {
  const u8 = new Uint8Array(arrayBuffer);
  const eocd = findEOCD(u8);
  if (eocd < 0) return { ok: false, error: "zip_eocd_not_found" };

  const cdSize = u32le(u8, eocd + 12);
  const cdOff = u32le(u8, eocd + 16);
  const total = u16le(u8, eocd + 10);

  if (cdOff + cdSize > u8.length) return { ok: false, error: "zip_central_dir_oob" };

  const sig = 0x02014b50;
  let off = cdOff;
  const entries = [];

  for (let n = 0; n < total && entries.length < maxEntries; n += 1) {
    if (off + 46 > u8.length) break;
    const s = u32le(u8, off);
    if (s !== sig) break;

    const method = u16le(u8, off + 10);
    const crc32 = u32le(u8, off + 16);
    const compressed = u32le(u8, off + 20);
    const uncompressed = u32le(u8, off + 24);
    const nameLen = u16le(u8, off + 28);
    const extraLen = u16le(u8, off + 30);
    const commentLen = u16le(u8, off + 32);
    const localHeaderOff = u32le(u8, off + 42);

    const nameOff = off + 46;
    const nameBytes = u8.slice(nameOff, nameOff + nameLen);
    const name = decodeUtf8(nameBytes);
    const isDir = name.endsWith("/");

    entries.push({
      name,
      isDir,
      method,
      crc32,
      compressedSize: compressed,
      uncompressedSize: uncompressed,
      localHeaderOff,
    });

    off = nameOff + nameLen + extraLen + commentLen;
  }

  const totals = entries.reduce(
    (acc, e) => {
      acc.files += e.isDir ? 0 : 1;
      acc.dirs += e.isDir ? 1 : 0;
      acc.compressed += e.compressedSize;
      acc.uncompressed += e.uncompressedSize;
      return acc;
    },
    { files: 0, dirs: 0, compressed: 0, uncompressed: 0 },
  );

  return { ok: true, entries, totals };
}

export function formatBytes(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v) || v <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let x = v;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i += 1;
  }
  const d = x >= 100 || i === 0 ? 0 : x >= 10 ? 1 : 2;
  return `${x.toFixed(d)} ${units[i]}`;
}

