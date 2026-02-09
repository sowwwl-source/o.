import os from "node:os";
import path from "node:path";

export function agentHome(): string {
  const override = process.env.O_AGENT_HOME;
  if (override && override.trim()) return path.resolve(override.trim());
  return path.join(os.homedir(), ".o-agent");
}

export function ageIdentityPath(): string {
  return path.join(agentHome(), "age", "age_service.key");
}

export function configPath(): string {
  return path.join(agentHome(), "config.json");
}

export function tokenSecretAgePath(): string {
  return path.join(agentHome(), "token.age");
}

export function sshPubPath(): string {
  return path.join(agentHome(), "ssh", "id_ed25519.pub");
}

export function sshPrivAgePath(): string {
  return path.join(agentHome(), "ssh", "id_ed25519.age");
}

export function sshCertPath(): string {
  return path.join(agentHome(), "ssh", "id_ed25519-cert.pub");
}

export function caPubPath(): string {
  return path.join(agentHome(), "ssh", "ca.pub");
}
