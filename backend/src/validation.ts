export function isLikelySshPublicKey(line: string): boolean {
  const s = line.trim();
  // Minimal: "ssh-ed25519 AAAA..." or "ssh-rsa AAAA..." etc.
  return /^(ssh-(ed25519|rsa|ecdsa)|sk-ssh-(ed25519|rsa)@openssh\.com)\s+[A-Za-z0-9+/=]+(?:\s+.*)?$/.test(
    s,
  );
}

