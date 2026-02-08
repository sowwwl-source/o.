import { describe, expect, it } from "vitest";
import { exportZeroisoGif } from "../zeroisoExportGif";

describe("exportZeroisoGif", () => {
  it("returns a GIF blob", async () => {
    const frames = [
      { text: "0isO\n..//\n" },
      { text: "0isO\n//..\n" },
    ];
    const res = await exportZeroisoGif({ frames, fps: 10, bg: "#0b0d0f", fg: "#e7e7e7" });
    expect(res.blob.type).toBe("image/gif");
    expect(res.bytes[0]).toBe(0x47); // G
    expect(res.bytes[1]).toBe(0x49); // I
    expect(res.bytes[2]).toBe(0x46); // F
    expect(res.blob.size).toBeGreaterThan(20);
  });
});

