import { run, runChecked, runInherit } from "./process.js";
import type { SessionKind, TmuxOptions, TmuxSession } from "./types.js";

const SESSION_FORMAT = [
  "#{session_id}",
  "#{session_name}",
  "#{session_attached}",
  "#{session_created}",
  "#{session_last_attached}"
].join("\t");

export function ensureTmuxAvailable(): void {
  const result = run("tmux", ["-V"]);
  if (result.status !== 0) {
    throw new Error("tmux is required but was not found in PATH.");
  }
}

export function listTmuxSessions(): TmuxSession[] {
  const result = run("tmux", ["list-sessions", "-F", SESSION_FORMAT]);
  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    if (
      stderr.includes("no server running") ||
      stderr.includes("failed to connect") ||
      stderr.includes("error connecting")
    ) {
      return [];
    }
    throw new Error(stderr || "Failed to list tmux sessions.");
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, name, attached, created, lastAttached] = line.split("\t");
      return {
        id,
        name,
        attached: attached !== "0",
        createdAtEpoch: Number(created),
        lastAttachedAtEpoch: Number(lastAttached) || undefined
      };
    });
}

export function createTmuxSession(options: {
  name: string;
  cwd: string;
  smuxSessionId: string;
  kind: SessionKind;
}): TmuxSession {
  const result = run("tmux", [
    "new-session",
    "-d",
    "-s",
    options.name,
    "-c",
    options.cwd,
    "-e",
    `SMUX_SESSION_ID=${options.smuxSessionId}`,
    "-e",
    `SMUX_SESSION_KIND=${options.kind}`
  ]);
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(`tmux new-session failed${detail ? `: ${detail}` : ""}`);
  }

  const created = listTmuxSessions().find((session) => session.name === options.name);
  if (!created) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(`tmux did not create session "${options.name}"${detail ? `: ${detail}` : ""}`);
  }
  return created;
}

export function sendCommand(target: string, command: string): void {
  runChecked("tmux", ["send-keys", "-t", target, command, "C-m"]);
}

export function pasteMessage(target: string, message: string): void {
  runChecked("tmux", ["set-buffer", message]);
  runChecked("tmux", ["paste-buffer", "-t", target]);
  runChecked("tmux", ["send-keys", "-t", target, "C-m"]);
}

function setTmuxOption(args: string[]): void {
  run("tmux", args);
}

function applyStatusLine(targetArgs: string[]): void {
  setTmuxOption(["set-option", ...targetArgs, "status", "on"]);
  setTmuxOption(["set-option", ...targetArgs, "status-position", "bottom"]);
  setTmuxOption(["set-option", ...targetArgs, "status-style", "bg=green,fg=black"]);
  setTmuxOption(["set-option", ...targetArgs, "status-left-length", "120"]);
  setTmuxOption(["set-option", ...targetArgs, "status-right-length", "160"]);
  setTmuxOption([
    "set-option",
    ...targetArgs,
    "status-left",
    "#[bg=green,fg=black,bold] smux #[bg=green,fg=black] #S #[bg=green,fg=black,bold]  detach C-b d -> smux dashboard #[default]"
  ]);
  setTmuxOption([
    "set-option",
    ...targetArgs,
    "status-right",
    "#[bg=green,fg=black] scroll C-b [ | #{pane_current_path} | %H:%M "
  ]);
}

export function applyTmuxOptions(target: string | undefined, options: Required<TmuxOptions>): void {
  const targetArgs = target ? ["-t", target] : ["-g"];
  const history = String(options.historyLimit);
  const mouse = options.mouse ? "on" : "off";

  setTmuxOption(["set-option", ...targetArgs, "mouse", mouse]);
  setTmuxOption(["set-window-option", ...targetArgs, "history-limit", history]);
  setTmuxOption(["set-window-option", ...targetArgs, "mode-keys", options.modeKeys]);
  applyStatusLine(targetArgs);
}

export function capturePreview(target: string, lines = 30): string {
  const result = run("tmux", ["capture-pane", "-p", "-t", target, "-S", `-${lines}`]);
  if (result.status !== 0) {
    return "";
  }
  return result.stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-lines)
    .join("\n");
}

export function paneCurrentPath(target: string): string | undefined {
  const result = run("tmux", [
    "list-panes",
    "-t",
    target,
    "-F",
    "#{pane_active}\t#{pane_current_path}"
  ]);
  if (result.status !== 0) {
    return undefined;
  }

  const panes = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [active, path] = line.split("\t");
      return { active: active === "1", path };
    });

  return panes.find((pane) => pane.active)?.path ?? panes[0]?.path;
}

export function renameTmuxSession(target: string, name: string): void {
  runChecked("tmux", ["rename-session", "-t", target, name]);
}

export function killTmuxSession(target: string): void {
  runChecked("tmux", ["kill-session", "-t", target]);
}

export function attachTmuxSession(target: string): Promise<number> {
  return runInherit("tmux", ["attach-session", "-t", target]);
}
