import { execSync, spawnSync } from "node:child_process";
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

export function resolveBuildId(env = process.env) {
  const viteId = (env.VITE_BUILD_ID ?? "").trim();
  if (viteId) return viteId;

  const gh = (env.GITHUB_SHA ?? "").trim();
  if (gh) return gh.slice(0, 7);

  const git = safeExec("git rev-parse --short HEAD");
  if (git) return git;

  return "unknown";
}

export function resolveBuildTime(env = process.env) {
  const viteTime = (env.VITE_BUILD_TIME ?? "").trim();
  if (viteTime) return viteTime;
  return new Date().toISOString();
}

export function runViteBuild(env = process.env) {
  const child = spawnSync("vite", ["build"], {
    stdio: "inherit",
    env,
  });

  if (child.status !== 0) {
    process.exit(child.status ?? 1);
  }
}

export async function writeBuildArtifacts(opts = {}) {
  const cwd = opts.cwd ? path.resolve(opts.cwd) : process.cwd();
  const env = opts.env ?? process.env;
  const id = resolveBuildId(env);
  const time = resolveBuildTime(env);

  const distDir = path.resolve(cwd, "dist");
  await mkdir(distDir, { recursive: true });
  await writeFile(path.join(distDir, "o.build.json"), JSON.stringify({ id, time }) + "\n", "utf8");

  const indexPath = path.join(distDir, "index.html");
  try {
    const html = await readFile(indexPath, "utf8");
    const patched = html.replaceAll("__O_BUILD_ID__", id).replaceAll("__O_BUILD_TIME__", time);
    if (patched !== html) await writeFile(indexPath, patched, "utf8");
  } catch {
    // No built index.html yet.
  }
}
