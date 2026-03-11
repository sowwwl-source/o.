import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

// Patch the built HTML so build metadata is always available, even when the
// local build runs without explicitly exported env vars.
const indexPath = path.join(distDir, "index.html");
try {
  const html = await readFile(indexPath, "utf8");
  const patched = html.replaceAll("__O_BUILD_ID__", id).replaceAll("__O_BUILD_TIME__", time);
  if (patched !== html) await writeFile(indexPath, patched, "utf8");
} catch {
  // No built index.html (e.g. running the script standalone).
}
