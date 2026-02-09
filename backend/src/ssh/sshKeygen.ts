import { spawn } from "node:child_process";

export type ExecResult = { stdout: string; stderr: string };

export function execFileStrict(cmd: string, args: string[], opts?: { cwd?: string }): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts?.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} ${args.join(" ")} failed (code=${code}): ${stderr || stdout}`));
    });
  });
}

