import { describe, expect, it } from "vitest";
import {
  assertPublicOnlySeed,
  cloudNamespace,
  normalizeSshPubkey,
  principalIdFromSshPubkey,
  seedFromSshPublicKey,
  zeroisoSeed,
} from "../zeroisoSeed";

describe("0isO ↔ CLOUD link", () => {
  it("normalizes ssh pubkey to first 2 fields", () => {
    const key = "  ssh-ed25519   AAAAC3NzaC1lZDI1NTE5AAAAIFo2b0Zvb0Zvbw==   user@host  \nignored";
    expect(normalizeSshPubkey(key)).toBe("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFo2b0Zvb0Zvbw==");
  });

  it("derives stable principal_id (Crockford base32, 28 chars)", async () => {
    const keyA =
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFo2b0Zvb0Zvb0Zvb0Zvb0Zvb0Zvb0Zvb0Zvbw== user@host";
    const keyA2 =
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFo2b0Zvb0Zvb0Zvb0Zvb0Zvb0Zvb0Zvb0Zvbw== another@comment";
    const keyB =
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFo2b0Zvb0Zvb0Zvb0Zvb0Zvb0Zvb0Zvb0ZvbA== user@host";

    const pidA = await principalIdFromSshPubkey(keyA);
    const pidA2 = await principalIdFromSshPubkey(keyA2);
    const pidB = await principalIdFromSshPubkey(keyB);

    expect(pidA).toMatch(/^[0-9A-HJKMNPQRSTVWXYZ]{28}$/);
    expect(pidA).toBe(pidA2); // comment ignored
    expect(pidA).not.toBe(pidB); // payload change
  });

  it("builds cloud namespace + seed (public-only)", async () => {
    const key =
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFo2b0Zvb0Zvb0Zvb0Zvb0Zvb0Zvb0Zvb0Zvbw== user@host";
    const pid = await principalIdFromSshPubkey(key);
    const ns = cloudNamespace(pid);
    const seed = zeroisoSeed(pid, "v1");
    const seed2 = await seedFromSshPublicKey(key);

    expect(ns).toBe(`soul.cloud/u/${pid}`);
    expect(seed).toBe(`0iso:${pid}:v1`);
    expect(seed2).toBe(seed);
    expect(() => assertPublicOnlySeed(seed)).not.toThrow();
    expect(() => assertPublicOnlySeed("-----BEGIN PRIVATE KEY-----")).toThrow();
  });
});

