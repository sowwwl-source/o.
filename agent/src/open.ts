import { spawn } from "node:child_process";

export function openBrowser(url: string): void {
  const p = process.platform;
  const cmd = p === "darwin" ? "open" : p === "win32" ? "cmd" : "xdg-open";
  const args = p === "win32" ? ["/c", "start", url] : [url];
  const child = spawn(cmd, args, { stdio: "ignore", detached: true });
  child.unref();
}

