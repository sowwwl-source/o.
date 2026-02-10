import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function safeExec(cmd) {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

function resolveBuildId() {
  const viteId = (process.env.VITE_BUILD_ID ?? "").trim();
  if (viteId) return viteId;

  const gh = (process.env.GITHUB_SHA ?? "").trim();
  if (gh) return gh.slice(0, 7);

  const git = safeExec("git rev-parse --short HEAD");
  if (git) return git;

  return "unknown";
}

function resolveBuildTime() {
  const viteTime = (process.env.VITE_BUILD_TIME ?? "").trim();
  if (viteTime) return viteTime;
  return new Date().toISOString();
}

const id = resolveBuildId();
const time = resolveBuildTime();

const distDir = path.resolve(process.cwd(), "dist");
await mkdir(distDir, { recursive: true });
await writeFile(path.join(distDir, "o.build.json"), JSON.stringify({ id, time }) + "\n", "utf8");
