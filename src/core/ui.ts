import type { AgentStatus, SessionKind } from "./types.js";
import { style } from "./theme.js";

export function kindLabel(kind: SessionKind): string {
  if (kind === "codex") {
    return style.cyan("codex");
  }
  if (kind === "claude") {
    return style.magenta("claude");
  }
  return style.gray("shell");
}

export function statusLabel(status: AgentStatus): string {
  switch (status) {
    case "running":
      return style.green("running");
    case "waiting":
      return style.yellow("waiting");
    case "blocked":
      return style.red("blocked");
    case "done":
      return style.blue("done");
    case "idle":
      return style.gray("idle");
    case "unknown":
      return style.gray("unknown");
  }
}

export function gitLabel(branch?: string, dirty?: boolean): string {
  if (!branch) {
    return style.gray("-");
  }
  return dirty ? style.yellow(`${branch}*`) : style.green(branch);
}

