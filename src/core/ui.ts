import type { AgentStatus, SessionKind } from "./types.js";
import { solid, style } from "./theme.js";

export function kindLabel(kind: SessionKind): string {
  if (kind === "codex") {
    return style.cyan("◆ codex");
  }
  if (kind === "claude") {
    return style.magenta("✦ claude");
  }
  return style.gray("• shell");
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

export function kindBadge(kind: SessionKind, active = false): string {
  if (kind === "codex") {
    return active ? solid("◆ codex", "cyan") : style.cyan(" ◆ codex ");
  }
  if (kind === "claude") {
    return active ? solid("✦ claude", "magenta") : style.magenta(" ✦ claude ");
  }
  return active ? style.inverse(" • shell ") : style.gray(" • shell ");
}

export function statusBadge(status: AgentStatus): string {
  switch (status) {
    case "running":
      return solid("running", "green");
    case "waiting":
      return solid("waiting", "yellow");
    case "blocked":
      return solid("blocked", "red");
    case "done":
      return solid("done", "blue");
    case "idle":
      return style.gray(" idle ");
    case "unknown":
      return style.gray(" unknown ");
  }
}

export function gitLabel(branch?: string, dirty?: boolean): string {
  if (!branch) {
    return style.gray("-");
  }
  return dirty ? style.yellow(`${branch}*`) : style.green(branch);
}
