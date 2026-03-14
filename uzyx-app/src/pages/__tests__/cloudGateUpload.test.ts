import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { buildSoulManifest, buildSoulArchiveName, describeSoulFiles, prepareSoulArchive } from "../cloudGateUpload";

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
    reader.readAsArrayBuffer(blob);
  });
}

describe("cloudGateUpload", () => {
  it("keeps a single zip as-is", async () => {
    const zip = new File([new Uint8Array([80, 75, 3, 4])], "already.zip", { type: "application/zip" });

    const prepared = await prepareSoulArchive([zip], "bundle.zip");

    expect(prepared.bundled).toBe(false);
    expect(prepared.archive).toBe(zip);
    expect(prepared.files).toEqual([
      {
        name: "already.zip",
        path: "already.zip",
        bytes: 4,
        type: "application/zip",
      },
    ]);
  });

  it("deduplicates names and creates a zip bundle for multiple files", async () => {
    const one = new File(["alpha"], "same.txt", { type: "text/plain" });
    const two = new File(["beta"], "same.txt", { type: "text/plain" });

    const prepared = await prepareSoulArchive([one, two], "bundle.zip");
    const archive = unzipSync(new Uint8Array(await readBlob(prepared.archive)));

    expect(prepared.bundled).toBe(true);
    expect(prepared.archive.name).toBe("bundle.zip");
    expect(Object.keys(archive)).toEqual(["same.txt", "same-2.txt"]);
    expect(strFromU8(archive["same.txt"])).toBe("alpha");
    expect(strFromU8(archive["same-2.txt"])).toBe("beta");
  });

  it("builds a manifest with principal and note metadata", () => {
    const file = new File(["alpha"], "one.txt", { type: "text/plain" });
    Object.defineProperty(file, "webkitRelativePath", {
      value: "folder/one.txt",
    });
    const files = [file];
    const manifest = buildSoulManifest({
      files,
      note: " bras de fer ",
      principalId: "principal-1",
      cloud: "soul.cloud/demo",
      tokenHint: "tok...1234",
    });

    expect(manifest.kind).toBe("soul_upload");
    expect(manifest.principal_id).toBe("principal-1");
    expect(manifest.cloud).toBe("soul.cloud/demo");
    expect(manifest.token_hint).toBe("tok...1234");
    expect(manifest.note).toBe("bras de fer");
    expect(manifest.file_count).toBe(1);
    expect(manifest.files[0]).toMatchObject({
      name: "one.txt",
      path: "folder/one.txt",
      bytes: 5,
      type: "text/plain",
    });
  });

  it("generates stable archive names and sanitized file descriptors", () => {
    const now = new Date("2026-03-14T09:26:53.000Z");
    const file = new File(["x"], "name.txt", { type: "text/plain" });
    Object.defineProperty(file, "webkitRelativePath", {
      value: "../odd//name.txt",
    });
    const files = describeSoulFiles([file]);

    expect(buildSoulArchiveName(now)).toBe("soul-bundle-20260314T092653Z.zip");
    expect(files).toEqual([
      {
        name: "name.txt",
        path: "_/odd/name.txt",
        bytes: 1,
        type: "text/plain",
      },
    ]);
  });
});
