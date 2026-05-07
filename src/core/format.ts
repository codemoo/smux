import { relative } from "node:path";
import { homedir } from "node:os";
import type { ListView, SmuxConfig, SmuxSession, TmuxOptions } from "./types.js";
import {
  box,
  boxLines,
  field,
  fillLine,
  joinColumns,
  key,
  padEndVisible,
  pill,
  sectionTitle,
  style,
  stripAnsi,
  terminalHeight,
  terminalWidth,
  truncate,
  visibleLength
} from "./theme.js";
import { gitLabel, kindLabel, statusLabel } from "./ui.js";

interface NewSessionFormState {
  step: number;
  name: string;
  objective: string;
  kind: "claude" | "codex" | "shell";
  tags: string;
  sendObjective: boolean;
}

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

function emptyPanel(filter: string): string[] {
  return [
    "",
    style.bold(filter ? "No matching sessions" : "No active tmux sessions"),
    "",
    `${key("n")} create a new session`,
    `${key("/")} ${filter ? "adjust filter" : "filter sessions"}`,
    `${key("?")} show keyboard help`,
    "",
    style.dim("smux new --kind codex --name work")
  ];
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

function statusDot(session: SmuxSession): string {
  if (session.agentStatus === "running") {
    return style.green("●");
  }
  if (session.agentStatus === "waiting") {
    return style.yellow("●");
  }
  if (session.agentStatus === "blocked") {
    return style.red("●");
  }
  if (session.agentStatus === "done") {
    return style.blue("●");
  }
  return style.gray("●");
}

function dashboardSessionRows(options: {
  sessions: SmuxSession[];
  selected?: SmuxSession;
  width: number;
  height: number;
  filter: string;
}): string[] {
  if (options.sessions.length === 0) {
    return emptyPanel(options.filter);
  }

  const rowHeight = 2;
  const availableRows = Math.max(1, Math.floor((options.height - 3) / rowHeight));
  const selectedIndex = Math.max(0, options.selected ? options.sessions.findIndex((session) => session.id === options.selected?.id) : 0);
  const start = Math.min(
    Math.max(0, selectedIndex - Math.floor(availableRows / 2)),
    Math.max(0, options.sessions.length - availableRows)
  );
  const visible = options.sessions.slice(start, start + availableRows);
  const rows: string[] = [];

  for (const session of visible) {
    const globalIndex = options.sessions.indexOf(session);
    const selected = session.id === options.selected?.id;
    const number = style.gray(String(globalIndex + 1).padStart(2));
    const titleWidth = Math.max(12, options.width - 30);
    const title = padEndVisible(style.bold(session.name), titleWidth);
    const head = `${selected ? style.cyan("›") : " "} ${number} ${statusDot(session)} ${kindLabel(session.kind)} ${title} ${statusLabel(session.agentStatus)}`;
    const metaParts = [
      shortenPath(session.cwd),
      session.gitBranch ? `${session.gitBranch}${session.gitDirty ? "*" : ""}` : undefined,
      session.objective || undefined
    ].filter(Boolean);
    const meta = `    ${style.dim(truncate(metaParts.join(" · "), options.width - 6))}`;
    rows.push(selected ? style.inverse(stripAnsi(fillLine(head, options.width))) : fillLine(head, options.width));
    rows.push(selected ? style.bold(meta) : meta);
  }

  if (options.sessions.length > visible.length) {
    rows.push(style.gray(`showing ${start + 1}-${start + visible.length} of ${options.sessions.length}`));
  }

  return rows;
}

function detailRows(session: SmuxSession | undefined, width: number): string[] {
  if (!session) {
    return [
      style.bold("No session selected"),
      "",
      "Create a session to start managing agent work.",
      "",
      `${key("n")} new session`,
      `${key("?")} keyboard help`
    ];
  }

  const preview = session.lastPreview
    ? session.lastPreview
        .split("\n")
        .filter(Boolean)
        .slice(-7)
        .map((line) => `  ${style.dim(truncate(line, width - 8))}`)
    : [`  ${style.gray("-")}`];
  const notes = session.notes.length
    ? session.notes.slice(-3).map((note) => `  ${style.gray("-")} ${truncate(note.text, width - 8)}`)
    : [`  ${style.gray("-")}`];
  const tags = session.tags.length ? session.tags.map((tag) => style.cyan(`#${tag}`)).join(" ") : style.gray("-");
  const scroll = [
    `history ${session.tmux?.historyLimit ?? "global"}`,
    `mouse ${session.tmux?.mouse === undefined ? "global" : session.tmux.mouse ? "on" : "off"}`
  ].join(" · ");

  return [
    `${kindLabel(session.kind)} ${statusLabel(session.agentStatus)} ${style.gray(session.status)}`,
    "",
    field("cwd", shortenPath(session.cwd)),
    field("git", session.gitBranch ? `${gitLabel(session.gitBranch, session.gitDirty)}${session.gitDirty ? style.gray(" dirty") : ""}` : style.gray("-")),
    field("scroll", scroll),
    field("tags", tags),
    "",
    sectionTitle("objective"),
    `  ${session.objective ? truncate(session.objective, width - 6) : style.gray("no objective")}`,
    "",
    sectionTitle("preview"),
    ...preview,
    "",
    sectionTitle("notes"),
    ...notes
  ];
}

function commandBar(width: number): string {
  const left = " ↑/↓ move  enter attach  n new  / filter  ? help";
  const right = "s status  m send  x kill  q quit ";
  if (visibleLength(left) + visibleLength(right) + 4 > width) {
    return style.inverse(fillLine(" enter attach   n new   / filter   ? help   q quit", width));
  }
  return style.inverse(`${left}${" ".repeat(Math.max(1, width - visibleLength(left) - visibleLength(right)))}${right}`);
}

function topBar(options: {
  width: number;
  view: ListView;
  sessions: SmuxSession[];
  filter: string;
  config: SmuxConfig;
}): string[] {
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const title = ` smux `;
  const meta = [
    "local",
    `${options.sessions.length} active`,
    `view ${options.view}`,
    options.filter ? `filter ${options.filter}` : undefined,
    `scroll ${options.config.tmux.historyLimit.toLocaleString()}`,
    `mouse ${options.config.tmux.mouse ? "on" : "off"}`
  ].filter(Boolean).join("  ·  ");
  const right = ` ${now} `;
  const maxMetaWidth = Math.max(0, options.width - visibleLength(title) - visibleLength(right) - 2);
  const line = `${title}${truncate(meta, maxMetaWidth)}`;
  const padding = Math.max(1, options.width - visibleLength(line) - visibleLength(right));
  return [
    style.inverse(`${line}${" ".repeat(padding)}${right}`),
    fillLine(`${formatTabs(options.view)}  ${counts(options.sessions)}`, options.width)
  ];
}

function formatDashboardWide(options: {
  view: ListView;
  sessions: SmuxSession[];
  allSessions: SmuxSession[];
  selected?: SmuxSession;
  filter: string;
  config: SmuxConfig;
  message?: string;
}): string {
  const width = terminalWidth();
  const height = terminalHeight();
  const leftWidth = Math.max(48, Math.floor(width * 0.58));
  const rightWidth = width - leftWidth - 2;
  const fixedRows = 5 + (options.message ? 1 : 0);
  const panelHeight = Math.max(4, height - fixedRows);

  const left = boxLines(
    `sessions ${options.sessions.length}/${options.allSessions.length}`,
    dashboardSessionRows({
      sessions: options.sessions,
      selected: options.selected,
      width: leftWidth - 4,
      height: panelHeight - 2,
      filter: options.filter
    }),
    leftWidth,
    panelHeight
  );
  const right = boxLines(
    options.selected ? `details ${options.selected.name}` : "details",
    detailRows(options.selected, rightWidth - 4),
    rightWidth,
    panelHeight
  );

  const [header, subheader] = topBar({
    width,
    view: options.view,
    sessions: options.allSessions,
    filter: options.filter,
    config: options.config
  });
  const notice = options.message ? `${style.yellow("notice")} ${options.message}` : "";

  return [
    header,
    subheader,
    ...(notice ? [fillLine(notice, width)] : []),
    "",
    ...joinColumns(left, right),
    "",
    commandBar(width)
  ].join("\n");
}

function formatDashboardStacked(options: {
  view: ListView;
  sessions: SmuxSession[];
  allSessions: SmuxSession[];
  selected?: SmuxSession;
  filter: string;
  config: SmuxConfig;
  message?: string;
}): string {
  const width = terminalWidth();
  const height = terminalHeight();
  const [header, subheader] = topBar({
    width,
    view: options.view,
    sessions: options.allSessions,
    filter: options.filter,
    config: options.config
  });
  const notice = options.message ? `${style.yellow("notice")} ${options.message}` : "";
  const fixedRows = 6 + (notice ? 1 : 0);
  const remaining = Math.max(4, height - fixedRows);
  const listHeight = Math.max(4, Math.floor(remaining * 0.55));
  const detailHeight = Math.max(4, remaining - listHeight);

  const list = boxLines(
    `sessions ${options.sessions.length}/${options.allSessions.length}`,
    dashboardSessionRows({
      sessions: options.sessions,
      selected: options.selected,
      width: width - 4,
      height: listHeight - 2,
      filter: options.filter
    }),
    width,
    listHeight
  );
  const details = boxLines(
    options.selected ? `details ${options.selected.name}` : "details",
    detailRows(options.selected, width - 4),
    width,
    detailHeight
  );

  return [
    header,
    subheader,
    ...(notice ? [fillLine(notice, width)] : []),
    "",
    ...list,
    "",
    ...details,
    "",
    commandBar(width)
  ].join("\n");
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
  if (terminalWidth() >= 104) {
    return formatDashboardWide(options);
  }

  return formatDashboardStacked(options);
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

function inputLine(label: string, value: string, active: boolean, hint?: string): string {
  const marker = active ? style.cyan("›") : " ";
  const renderedValue = active ? style.inverse(` ${value || " "} `) : style.bold(value || style.gray("-"));
  const suffix = hint ? ` ${style.dim(hint)}` : "";
  return `${marker} ${padEndVisible(label, 18)} ${renderedValue}${suffix}`;
}

function segmentedKind(value: "claude" | "codex" | "shell", active: boolean): string {
  const item = (kind: "claude" | "codex" | "shell", hotkey: string) => {
    const body = `${hotkey} ${kind}`;
    if (kind === value) {
      return active ? style.inverse(` ${body} `) : style.cyan(`[${body}]`);
    }
    return style.gray(` ${body} `);
  };
  return [item("codex", "c"), item("claude", "l"), item("shell", "s")].join(" ");
}

export function formatNewSessionForm(options: {
  state: NewSessionFormState;
  cwd: string;
  config: SmuxConfig;
}): string {
  const width = terminalWidth();
  const height = terminalHeight();
  const state = options.state;
  const [header] = topBar({
    width,
    view: "recent",
    sessions: [],
    filter: "",
    config: options.config
  });
  const formWidth = Math.min(width, Math.max(72, Math.floor(width * 0.72)));
  const leftPad = Math.max(0, Math.floor((width - formWidth) / 2));
  const spacer = " ".repeat(leftPad);
  const kindLine = `${state.step === 2 ? style.cyan("›") : " "} ${padEndVisible("agent", 18)} ${segmentedKind(state.kind, state.step === 2)} ${style.dim("left/right or hotkey")}`;
  const canSendObjective = state.kind !== "shell" && state.objective.trim().length > 0;
  const sendValue = !canSendObjective
    ? style.gray("disabled")
    : state.sendObjective
      ? style.green("send objective")
      : style.gray("do not send");
  const sendHint = canSendObjective ? "space toggles" : "requires agent objective";
  const sendLine = `${state.step === 4 ? style.cyan("›") : " "} ${padEndVisible("initial prompt", 18)} ${sendValue} ${style.dim(sendHint)}`;
  const body = [
    style.bold("Create session"),
    style.dim("Keep this flow in the dashboard. Esc cancels, Enter advances."),
    "",
    field("cwd", shortenPath(options.cwd)),
    "",
    inputLine("name", state.name, state.step === 0, "editable"),
    inputLine("objective", state.objective, state.step === 1, "optional"),
    kindLine,
    inputLine("tags", state.tags, state.step === 3, "comma separated"),
    sendLine,
    "",
    style.dim("Enter next/confirm  ·  Up/Down move  ·  Esc cancel")
  ];
  const boxHeight = Math.min(Math.max(14, height - 6), 24);
  const rows = boxLines("new session", body, formWidth, boxHeight).map((line) => `${spacer}${line}`);
  const footer = style.inverse(fillLine(" enter next/confirm   ↑/↓ move   ←/→ agent   space toggle   esc cancel", width));

  return [header, "", "", ...rows, "", footer].join("\n");
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
