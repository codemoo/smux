import { relative } from "node:path";
import { homedir } from "node:os";
import type { ListView, SmuxConfig, SmuxSession, TmuxOptions } from "./types.js";
import { box, field, key, padEndVisible, pill, sectionTitle, style, terminalWidth, truncate } from "./theme.js";
import { gitLabel, kindLabel, statusLabel } from "./ui.js";

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

function tableWidths(): { name: number; cwd: number; git: number } {
  const width = terminalWidth();
  if (width < 86) {
    return { name: 18, cwd: 22, git: 10 };
  }
  if (width < 110) {
    return { name: 24, cwd: 32, git: 14 };
  }
  return { name: 30, cwd: 42, git: 18 };
}

export function sortRecent(sessions: SmuxSession[]): SmuxSession[] {
  return [...sessions].sort((a, b) => {
    const aTime = new Date(a.lastAttachedAt ?? a.updatedAt ?? a.createdAt).getTime();
    const bTime = new Date(b.lastAttachedAt ?? b.updatedAt ?? b.createdAt).getTime();
    return bTime - aTime;
  });
}

export function sessionLine(session: SmuxSession, index?: number, selected = false): string {
  const widths = tableWidths();
  const marker = selected ? style.cyan("›") : " ";
  const prefix = index === undefined ? "" : `${marker} ${style.gray(String(index + 1).padStart(2))} `;
  const kind = padEndVisible(kindLabel(session.kind), 7);
  const name = padEndVisible(style.bold(session.name), widths.name);
  const cwd = padEndVisible(style.dim(shortenPath(session.cwd)), widths.cwd);
  const status = padEndVisible(statusLabel(session.agentStatus), 8);
  const git = padEndVisible(gitLabel(session.gitBranch, session.gitDirty), widths.git);
  const last = style.gray(timeLabel(session.lastAttachedAt));
  const line = `${prefix}${kind} ${name} ${cwd} ${status} ${git} ${last}`;
  return selected ? style.bold(line) : line;
}

function listHeader(): string {
  const widths = tableWidths();
  return [
    "    ",
    padEndVisible(style.gray("agent"), 7),
    padEndVisible(style.gray("session"), widths.name),
    padEndVisible(style.gray("cwd"), widths.cwd),
    padEndVisible(style.gray("state"), 8),
    padEndVisible(style.gray("git"), widths.git),
    style.gray("last")
  ].join(" ");
}

function emptyList(filter?: string): string {
  return box(style.cyan("smux"), [
    style.bold(filter ? "No matching sessions" : "No active tmux sessions"),
    "",
    `${key("n")} create a session from this directory`,
    `${key("/")} ${filter ? "clear or change filter" : "filter sessions"}`,
    `${key("q")} quit`,
    "",
    style.dim("Try: smux new --kind codex --name work")
  ]);
}

export function formatShell(view: ListView, sessions: SmuxSession[], filter = "", config?: SmuxConfig): string {
  const count = sessions.length;
  const active = count === 1 ? "1 session" : `${count} sessions`;
  const scroll = config ? `scroll ${config.tmux.historyLimit.toLocaleString()} · mouse ${config.tmux.mouse ? "on" : "off"}` : "";
  return [
    `${style.bold(style.cyan("smux"))} ${style.dim("AI session control for tmux")} ${style.gray("·")} ${style.gray(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}`,
    `${style.gray("view")} ${style.bold(view)}   ${style.gray("active")} ${active}${filter ? `   ${style.gray("filter")} ${style.yellow(filter)}` : ""}${scroll ? `   ${style.gray(scroll)}` : ""}`
  ].join("\n");
}

export function formatList(sessions: SmuxSession[], view: ListView, selectedId?: string, filter?: string): string {
  const active = sortRecent(sessions);
  if (active.length === 0) {
    return emptyList(filter);
  }

  if (view === "waiting") {
    return [
      listHeader(),
      ...active.map((session, index) => sessionLine(session, index, session.id === selectedId))
    ].join("\n");
  }

  if (view === "path") {
    const groups = new Map<string, SmuxSession[]>();
    for (const session of active) {
      const key = shortenPath(session.cwd);
      groups.set(key, [...(groups.get(key) ?? []), session]);
    }
    return [...groups.entries()]
      .map(([path, items]) =>
        [
          sectionTitle(path),
          listHeader(),
          ...items.map((item) => sessionLine(item, active.indexOf(item), item.id === selectedId))
        ].join("\n")
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
        return [
          sectionTitle(kindLabel(kind)),
          listHeader(),
          ...items.map((item) => sessionLine(item, active.indexOf(item), item.id === selectedId))
        ].join("\n");
      })
      .filter(Boolean)
      .join("\n\n");
  }

  return [
    listHeader(),
    ...active.map((session, index) => sessionLine(session, index, session.id === selectedId))
  ].join("\n");
}

function counts(sessions: SmuxSession[]): string {
  const waiting = sessions.filter((session) => session.agentStatus === "waiting").length;
  const blocked = sessions.filter((session) => session.agentStatus === "blocked").length;
  const running = sessions.filter((session) => session.agentStatus === "running").length;
  const codex = sessions.filter((session) => session.kind === "codex").length;
  const claude = sessions.filter((session) => session.kind === "claude").length;
  return [
    pill(`${sessions.length} active`, "cyan"),
    pill(`${running} running`, "green"),
    pill(`${waiting} waiting`, waiting ? "yellow" : "gray"),
    pill(`${blocked} blocked`, blocked ? "red" : "gray"),
    pill(`${codex} codex`, "gray"),
    pill(`${claude} claude`, "gray")
  ].join(" ");
}

function tab(label: string, active: boolean): string {
  return active ? style.inverse(` ${label} `) : style.gray(` ${label} `);
}

export function formatTabs(view: ListView): string {
  return [
    tab("r recent", view === "recent"),
    tab("p path", view === "path"),
    tab("a agent", view === "kind"),
    tab("w waiting", view === "waiting")
  ].join(" ");
}

function formatFocus(session?: SmuxSession): string {
  if (!session) {
    return box("focus", [style.gray("No session selected")]);
  }

  const preview = session.lastPreview
    ? session.lastPreview
        .split("\n")
        .filter(Boolean)
        .slice(-4)
        .map((line) => `  ${style.dim(truncate(line, terminalWidth() - 8))}`)
        .join("\n")
    : `  ${style.gray("-")}`;

  const objective = session.objective || style.gray("no objective");
  const tags = session.tags.length ? session.tags.map((tag) => style.cyan(`#${tag}`)).join(" ") : style.gray("-");

  return box(`focus ${session.name}`, [
    `${kindLabel(session.kind)} ${statusLabel(session.agentStatus)}   ${field("cwd", shortenPath(session.cwd))}`,
    `${field("objective", objective)}`,
    `${field("tags", tags)}`,
    `${field("git", session.gitBranch ? `${gitLabel(session.gitBranch, session.gitDirty)}${session.gitDirty ? style.gray(" dirty") : ""}` : style.gray("-"))}`,
    "",
    sectionTitle("preview"),
    preview
  ]);
}

export function formatDashboard(options: {
  view: ListView;
  sessions: SmuxSession[];
  allSessions: SmuxSession[];
  selected?: SmuxSession;
  filter: string;
  config: SmuxConfig;
  message?: string;
}): string {
  return [
    formatShell(options.view, options.allSessions, options.filter, options.config),
    counts(options.allSessions),
    "",
    formatTabs(options.view),
    options.message ? `${style.yellow("notice")} ${options.message}` : "",
    "",
    formatList(options.sessions, options.view, options.selected?.id, options.filter),
    "",
    formatFocus(options.selected),
    "",
    `${key("↑/↓ j/k")} move  ${key("enter")} attach  ${key("n")} new  ${key("/")} filter  ${key("?")} help`,
    `${key("s")} status  ${key("m")} send  ${key("x")} kill  ${key("esc")} clear  ${key("q")} quit`
  ].filter((line) => line !== "").join("\n");
}

export function formatDashboardHelp(): string {
  return box("keyboard", [
    `${key("↑/↓")} or ${key("j/k")} move selection`,
    `${key("enter")} attach to selected tmux session`,
    `${key("n")} create a new session`,
    `${key("/")} filter by name, path, objective, tag, kind, branch, or state`,
    `${key("r")} recent view   ${key("p")} path view   ${key("a")} agent view   ${key("w")} waiting view`,
    `${key("s")} inspect selected session without attaching`,
    `${key("m")} send a prompt to selected agent`,
    `${key("x")} kill selected session after confirmation`,
    `${key("esc")} clear filter   ${key("q")} quit`
  ]);
}

export function formatStatus(session: SmuxSession): string {
  const git = session.gitBranch
    ? `${gitLabel(session.gitBranch, session.gitDirty)} ${style.gray(session.gitDirty ? "dirty" : "clean")}`
    : style.gray("-");
  const tags = session.tags.length > 0 ? session.tags.map((tag) => style.cyan(`#${tag}`)).join(" ") : style.gray("-");
  const tmux = [
    `history ${session.tmux?.historyLimit ?? "global"}`,
    `mouse ${session.tmux?.mouse === undefined ? "global" : session.tmux.mouse ? "on" : "off"}`,
    `keys ${session.tmux?.modeKeys ?? "global"}`
  ].join(", ");
  const notes = session.notes.slice(-5).map((note) => `  ${style.gray("-")} ${note.text}`).join("\n") || `  ${style.gray("-")}`;
  const preview = session.lastPreview
    ? session.lastPreview
        .split("\n")
        .slice(-8)
        .map((line) => `  ${style.dim(truncate(line, terminalWidth() - 6))}`)
        .join("\n")
    : `  ${style.gray("-")}`;

  return box(`${session.name} ${kindLabel(session.kind)} ${statusLabel(session.agentStatus)}`, [
    field("cwd", shortenPath(session.cwd)),
    field("git", git),
    field("tmux", session.status),
    field("scroll", tmux),
    field("objective", session.objective || style.gray("-")),
    field("tags", tags),
    "",
    sectionTitle("last preview"),
    preview,
    "",
    sectionTitle("notes"),
    notes
  ]);
}

export function formatHelp(): string {
  return [
    `${style.bold(style.cyan("smux"))} ${style.dim("AI session control for tmux")}`,
    "",
    sectionTitle("Usage"),
    `  ${style.bold("smux")}                                      ${style.dim("open the session dashboard")}`,
    `  ${style.bold("smux list")} [--view recent|path|kind|waiting] ${style.dim("show sessions")}`,
    `  ${style.bold("smux new")} [--kind codex|claude|shell]       ${style.dim("create a session")}`,
    `            [--history-limit N] [--mouse|--no-mouse]`,
    `  ${style.bold("smux attach")} <name-or-id>                   ${style.dim("attach to tmux")}`,
    `  ${style.bold("smux status")} <name-or-id>                   ${style.dim("inspect without attaching")}`,
    `  ${style.bold("smux send")} <name-or-id> <message>           ${style.dim("send a confirmed prompt")}`,
    `  ${style.bold("smux rename")} <new-name> [name-or-id]        ${style.dim("sync smux and tmux names")}`,
    `  ${style.bold("smux config")}                                ${style.dim("show global settings")}`,
    `  ${style.bold("smux config set")} <key> <value>              ${style.dim("set global defaults")}`,
    `  ${style.bold("smux set")} <session> <key> <value>           ${style.dim("set a session override")}`,
    `  ${style.bold("smux kill")} <name-or-id>                     ${style.dim("terminate a session")}`,
    "",
    sectionTitle("Views"),
    `  ${key("r")} recent   ${key("p")} path   ${key("a")} agent   ${key("w")} waiting`,
    "",
    sectionTitle("Config Keys"),
    "  fullscreen",
    "  tmux.history-limit",
    "  tmux.mouse",
    "  tmux.mode-keys",
    "",
    style.dim("Package: smux-ai, binary: smux")
  ].join("\n");
}

export function formatConfig(config: SmuxConfig, path: string): string {
  return box("smux config", [
    field("path", path),
    field("fullscreen", config.fullscreen ? style.green("on") : style.gray("off")),
    field("tmux.history-limit", style.yellow(String(config.tmux.historyLimit))),
    field("tmux.mouse", config.tmux.mouse ? style.green("on") : style.gray("off")),
    field("tmux.mode-keys", config.tmux.modeKeys),
    "",
    style.dim("Set values with: smux config set tmux.history-limit 200000")
  ]);
}

export function formatSessionConfig(session: SmuxSession, effective: Required<TmuxOptions>): string {
  return box(`session config ${session.name}`, [
    field("tmux.history-limit", String(session.tmux?.historyLimit ?? `${effective.historyLimit} (global)`)),
    field("tmux.mouse", session.tmux?.mouse === undefined ? `${effective.mouse ? "on" : "off"} (global)` : session.tmux.mouse ? "on" : "off"),
    field("tmux.mode-keys", session.tmux?.modeKeys ?? `${effective.modeKeys} (global)`)
  ]);
}
