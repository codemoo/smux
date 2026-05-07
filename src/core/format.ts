import { relative } from "node:path";
import { homedir } from "node:os";
import type { ListView, SmuxSession } from "./types.js";

function shortenPath(path: string): string {
  const home = homedir();
  if (path === home) {
    return "~";
  }
  if (path.startsWith(`${home}/`)) {
    return `~/${path.slice(home.length + 1)}`;
  }
  const rel = relative(process.cwd(), path);
  return rel && !rel.startsWith("..") ? rel : path;
}

function timeLabel(value?: string): string {
  if (!value) {
    return "-";
  }

  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) {
    return "-";
  }

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) {
    return "now";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  return `${Math.floor(hours / 24)}d`;
}

function pad(value: string, length: number): string {
  return value.length >= length ? value.slice(0, length - 1) + "…" : value.padEnd(length);
}

export function sortRecent(sessions: SmuxSession[]): SmuxSession[] {
  return [...sessions].sort((a, b) => {
    const aTime = new Date(a.lastAttachedAt ?? a.updatedAt ?? a.createdAt).getTime();
    const bTime = new Date(b.lastAttachedAt ?? b.updatedAt ?? b.createdAt).getTime();
    return bTime - aTime;
  });
}

export function sessionLine(session: SmuxSession, index?: number): string {
  const prefix = index === undefined ? "" : `${String(index + 1).padStart(2)}. `;
  const git = session.gitBranch
    ? `${session.gitBranch}${session.gitDirty ? "*" : ""}`
    : "-";
  return `${prefix}${pad(session.kind, 7)} ${pad(session.name, 22)} ${pad(shortenPath(session.cwd), 28)} ${pad(session.agentStatus, 8)} ${pad(git, 14)} ${timeLabel(session.lastAttachedAt)}`;
}

export function formatList(sessions: SmuxSession[], view: ListView): string {
  const active = sortRecent(sessions);
  if (active.length === 0) {
    return "No active tmux sessions.\n";
  }

  if (view === "path") {
    const groups = new Map<string, SmuxSession[]>();
    for (const session of active) {
      const key = shortenPath(session.cwd);
      groups.set(key, [...(groups.get(key) ?? []), session]);
    }
    return [...groups.entries()]
      .map(([path, items]) =>
        [`${path}`, ...items.map((item) => `  ${sessionLine(item, active.indexOf(item))}`)].join("\n")
      )
      .join("\n\n");
  }

  if (view === "kind") {
    const kinds = ["codex", "claude", "shell"] as const;
    return kinds
      .map((kind) => {
        const items = active.filter((session) => session.kind === kind);
        if (items.length === 0) {
          return "";
        }
        return [`${kind}`, ...items.map((item) => `  ${sessionLine(item, active.indexOf(item))}`)].join("\n");
      })
      .filter(Boolean)
      .join("\n\n");
  }

  return [
    "    kind    name                   cwd                          status   git            last",
    ...active.map((session, index) => sessionLine(session, index))
  ].join("\n");
}

export function formatStatus(session: SmuxSession): string {
  const git = session.gitBranch
    ? `${session.gitBranch}${session.gitDirty ? " dirty" : " clean"}`
    : "-";
  const tags = session.tags.length > 0 ? session.tags.join(", ") : "-";
  const notes = session.notes.slice(-5).map((note) => `  - ${note.text}`).join("\n") || "  -";
  const preview = session.lastPreview
    ? session.lastPreview
        .split("\n")
        .slice(-8)
        .map((line) => `  ${line}`)
        .join("\n")
    : "  -";

  return [
    `${session.name}  ${session.kind}  ${session.agentStatus}`,
    `cwd: ${shortenPath(session.cwd)}`,
    `git: ${git}`,
    `status: ${session.status}`,
    `objective: ${session.objective || "-"}`,
    `tags: ${tags}`,
    "last preview:",
    preview,
    "notes:",
    notes
  ].join("\n");
}
