import { run } from "./process.js";
import type { GitInfo } from "./types.js";

export function gitInfo(cwd: string): GitInfo {
  const root = run("git", ["rev-parse", "--show-toplevel"], cwd);
  if (root.status !== 0) {
    return {};
  }

  const branch = run("git", ["branch", "--show-current"], cwd);
  const dirty = run("git", ["status", "--porcelain"], cwd);

  return {
    repoRoot: root.stdout.trim() || undefined,
    branch: branch.stdout.trim() || undefined,
    dirty: dirty.status === 0 ? dirty.stdout.trim().length > 0 : undefined
  };
}
