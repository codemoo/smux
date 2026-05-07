import { spawn, spawnSync } from "node:child_process";

export interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

export function run(command: string, args: string[], cwd?: string): RunResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8"
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

export function runChecked(command: string, args: string[], cwd?: string): string {
  const result = run(command, args, cwd);
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`);
  }
  return result.stdout;
}

export function runInherit(command: string, args: string[], cwd?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 0));
  });
}
