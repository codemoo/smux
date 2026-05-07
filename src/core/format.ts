import { relative } from "node:path";
import { homedir } from "node:os";
import type { ListView, SmuxConfig, SmuxSession, TmuxOptions } from "./types.js";
import {
  box,
  boxLines,
  field,
  fillLine,
  key,
  padEndVisible,
  pill,
  sectionTitle,
  solid,
  style,
  terminalHeight,
  terminalWidth,
  truncate,
  visibleLength
} from "./theme.js";
import { gitLabel, kindBadge, kindLabel, statusBadge, statusLabel } from "./ui.js";

interface NewSessionFormState {
  step: number;
  name: string;
  cwd: string;
  objective: string;
  kind: "claude" | "codex" | "shell";
  tags: string;
  resume: boolean;
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

function displayPath(path: string): string {
  if (!path) {
    return ".";
  }
  if (path.startsWith("/") || path.startsWith("~")) {
    return shortenPath(path);
  }
  return path;
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

function mutedLabel(label: string, value: string): string {
  return `${style.gray(label)} ${value}`;
}

function alignBetween(left: string, right: string, width: number): string {
  const rightWidth = visibleLength(right);
  const leftWidth = Math.max(1, width - rightWidth - 1);
  return `${padEndVisible(truncate(left, leftWidth), leftWidth)} ${right}`;
}

function divider(width: number): string {
  return style.gray("─".repeat(Math.max(0, width)));
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
  const kind = padEndVisible(kindLabel(session.kind), 9);
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
    padEndVisible(style.gray("agent"), 9),
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
    style.bold(filter ? "No matching sessions" : "No sessions are running"),
    style.dim(filter ? "Try a shorter filter or clear it with Esc." : "Create an agent workspace from the current directory."),
    "",
    `${key("n")} ${style.bold("new session")}   ${key("/")} ${filter ? "adjust filter" : "filter"}   ${key("?")} help`,
    "",
    style.dim("smux new --kind codex --name work --resume")
  ];
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

function counts(sessions: SmuxSession[], compact = false): string {
  const waiting = sessions.filter((session) => session.agentStatus === "waiting").length;
  const blocked = sessions.filter((session) => session.agentStatus === "blocked").length;
  const running = sessions.filter((session) => session.agentStatus === "running").length;
  const codex = sessions.filter((session) => session.kind === "codex").length;
  const claude = sessions.filter((session) => session.kind === "claude").length;
  if (compact) {
    return [
      solid(`${sessions.length}`, "cyan"),
      running ? pill(`${running} run`, "green") : undefined,
      waiting ? pill(`${waiting} wait`, "yellow") : undefined,
      blocked ? pill(`${blocked} block`, "red") : undefined
    ].filter(Boolean).join(" ");
  }
  return [
    solid(`${sessions.length} active`, "cyan"),
    pill(`${running} running`, "green"),
    pill(`${waiting} waiting`, waiting ? "yellow" : "gray"),
    pill(`${blocked} blocked`, blocked ? "red" : "gray"),
    pill(`${codex} codex`, "gray"),
    pill(`${claude} claude`, "gray")
  ].join(" ");
}

function tab(label: string, active: boolean): string {
  return active ? solid(label, "cyan") : style.gray(` ${label} `);
}

export function formatTabs(view: ListView, compact = false): string {
  if (compact) {
    return [
      tab("r", view === "recent"),
      tab("p", view === "path"),
      tab("a", view === "kind"),
      tab("w", view === "waiting")
    ].join(" ");
  }
  return [
    tab("r recent", view === "recent"),
    tab("p path", view === "path"),
    tab("a agent", view === "kind"),
    tab("w waiting", view === "waiting")
  ].join(" ");
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

function startupBadge(session: SmuxSession): string {
  if (session.kind === "shell") {
    return style.gray("shell");
  }
  return session.resume ? style.cyan("resume") : style.gray("fresh");
}

function startupLabel(session: SmuxSession): string {
  if (session.kind === "shell") {
    return "shell";
  }
  if (!session.resume) {
    return "fresh";
  }
  return session.kind === "codex" ? "resume (codex resume)" : "resume (claude -r)";
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
    const rail = selected ? style.cyan("┃") : " ";
    const number = selected ? solid(String(globalIndex + 1), "cyan") : style.gray(String(globalIndex + 1).padStart(2));
    const headLeft = `${rail} ${number} ${statusDot(session)} ${kindBadge(session.kind, selected)} ${selected ? style.white(style.bold(session.name)) : style.bold(session.name)}`;
    const head = alignBetween(headLeft, statusBadge(session.agentStatus), options.width);
    const metaParts = [
      mutedLabel("cwd", style.dim(shortenPath(session.cwd))),
      startupBadge(session),
      session.gitBranch ? mutedLabel("git", gitLabel(session.gitBranch, session.gitDirty)) : undefined,
      session.objective ? mutedLabel("task", style.dim(session.objective)) : undefined
    ].filter(Boolean);
    const branch = selected ? style.cyan("└") : style.gray("└");
    const meta = `  ${branch} ${truncate(metaParts.join(style.gray("  ·  ")), options.width - 4)}`;
    rows.push(fillLine(head, options.width));
    rows.push(fillLine(selected ? style.bold(meta) : meta, options.width));
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
  const title = alignBetween(
    `${kindBadge(session.kind)} ${statusBadge(session.agentStatus)} ${style.gray(session.status)}`,
    startupBadge(session),
    width
  );

  return [
    title,
    divider(width),
    "",
    field("cwd", style.white(shortenPath(session.cwd))),
    field("git", session.gitBranch ? `${gitLabel(session.gitBranch, session.gitDirty)}${session.gitDirty ? style.gray(" dirty") : ""}` : style.gray("-")),
    field("startup", startupLabel(session)),
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
  const left = `${key("↑/↓")} move  ${key("enter")} attach  ${key("n")} new  ${key("/")} filter`;
  const right = `${key("s")} status  ${key("m")} send  ${key("x")} kill  ${key("q")} quit`;
  if (visibleLength(left) + visibleLength(right) + 4 > width) {
    return fillLine(`${key("enter")} attach  ${key("n")} new  ${key("/")} filter  ${key("?")} help  ${key("q")} quit`, width);
  }
  return fillLine(`${left}${" ".repeat(Math.max(1, width - visibleLength(left) - visibleLength(right)))}${right}`, width);
}

function topBar(options: {
  width: number;
  view: ListView;
  sessions: SmuxSession[];
  filter: string;
  config: SmuxConfig;
}): string[] {
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const compact = options.width < 72;
  const brand = `${solid("◆ smux", "cyan")} ${style.bold("agent cockpit")}`;
  const meta = [
    "local",
    `${options.sessions.length} active`,
    compact ? options.view : `view ${options.view}`,
    options.filter ? `/${options.filter}` : undefined,
    compact ? undefined : `scroll ${options.config.tmux.historyLimit.toLocaleString()}`,
    compact ? undefined : `mouse ${options.config.tmux.mouse ? "on" : "off"}`
  ].filter(Boolean).join("  ·  ");
  const right = style.gray(now);
  const maxMetaWidth = Math.max(0, options.width - visibleLength(brand) - visibleLength(right) - 4);
  const line = `${brand} ${style.dim(truncate(meta, maxMetaWidth))}`;
  const padding = Math.max(1, options.width - visibleLength(line) - visibleLength(right));
  return [
    fillLine(`${line}${" ".repeat(padding)}${right}`, options.width),
    alignBetween(formatTabs(options.view, compact), counts(options.sessions, compact), options.width)
  ];
}

function fitScreenRows(rows: string[], width: number, height: number): string {
  const fitted = rows.slice(0, height).map((line) => fillLine(line, width));
  while (fitted.length < height) {
    fitted.push(fillLine("", width));
  }
  return fitted.join("\n");
}

function formatDashboardStable(options: {
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
  const notice = options.message ? `${solid("notice", "yellow")} ${options.message}` : "";
  const command = commandBar(width);
  const available = Math.max(4, height - 4);
  const showDetails = Boolean(options.selected) && available >= 10;
  const detailHeight = showDetails ? Math.min(10, Math.max(5, Math.floor(available * 0.35))) : 0;
  const listHeight = Math.max(4, available - detailHeight);

  const list = boxLines(
    `${style.cyan("sessions")} ${options.sessions.length}/${options.allSessions.length}`,
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
  const details = detailHeight > 0
    ? boxLines(
        options.selected ? `${style.cyan("focus")} ${options.selected.name}` : style.cyan("focus"),
        detailRows(options.selected, width - 4),
        width,
        detailHeight
      )
    : [];

  return fitScreenRows([
    header,
    subheader,
    fillLine(notice, width),
    ...list,
    ...details,
    command
  ], width, height);
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
  return formatDashboardStable(options);
}

export function formatDashboardHelp(): string {
  return boxLines(`${style.cyan("keyboard")} map`, [
    `${key("↑/↓")} or ${key("j/k")} move selection`,
    `${key("enter")} attach to selected tmux session`,
    `${key("n")} create a new session`,
    `${key("/")} filter by name, path, objective, tag, kind, branch, or state`,
    `${key("r")} recent view   ${key("p")} path view   ${key("a")} agent view   ${key("w")} waiting view`,
    `${key("s")} inspect selected session without attaching`,
    `${key("m")} send a prompt to selected agent`,
    `${key("x")} kill selected session after confirmation`,
    `${key("esc")} clear filter   ${key("q")} quit`
  ], terminalWidth(), Math.max(6, terminalHeight() - 1)).join("\n");
}

function inputLine(label: string, value: string, active: boolean, hint?: string, suggestion?: string): string {
  const marker = active ? style.cyan("┃") : style.gray("│");
  const renderedValue = active
    ? `${solid(` ${value || " "} `, "cyan")}${suggestion ? style.dim(suggestion) : ""}`
    : style.bold(value || style.gray("-"));
  const suffix = hint ? ` ${style.dim(hint)}` : "";
  return `${marker} ${padEndVisible(active ? style.white(style.bold(label)) : style.gray(label), 18)} ${renderedValue}${suffix}`;
}

function segmentedKind(value: "claude" | "codex" | "shell", active: boolean): string {
  const item = (kind: "claude" | "codex" | "shell", hotkey: string) => {
    const body = `${hotkey} ${kind}`;
    if (kind === value) {
      return active ? solid(body, kind === "claude" ? "magenta" : kind === "codex" ? "cyan" : "blue") : style.cyan(` ${body} `);
    }
    return style.gray(` ${body} `);
  };
  return [item("codex", "c"), item("claude", "l"), item("shell", "s")].join(" ");
}

function checkboxLine(label: string, checked: boolean, active: boolean, enabled: boolean, hint: string): string {
  const marker = active ? style.cyan("┃") : style.gray("│");
  const boxValue = checked ? "on" : "off";
  const value = enabled
    ? checked
      ? solid(boxValue, "green")
      : style.gray(` ${boxValue} `)
    : style.gray("disabled");
  return `${marker} ${padEndVisible(active ? style.white(style.bold(label)) : style.gray(label), 18)} ${value} ${style.dim(hint)}`;
}

function formTopBar(width: number, activeCount: number, config: SmuxConfig): string {
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const left = `${solid("◆ smux", "cyan")} ${style.bold("new workspace")}`;
  const compact = width < 64;
  const meta = compact
    ? [`${activeCount} active`].join("  ·  ")
    : [
        "local",
        `${activeCount} active`,
        `scroll ${config.tmux.historyLimit.toLocaleString()}`,
        `mouse ${config.tmux.mouse ? "on" : "off"}`
      ].join("  ·  ");
  const right = style.gray(now);
  const center = `${left} ${style.dim(truncate(meta, Math.max(0, width - visibleLength(left) - visibleLength(right) - 3)))}`;
  const padding = Math.max(1, width - visibleLength(center) - visibleLength(right));
  return fillLine(`${center}${" ".repeat(padding)}${right}`, width);
}

function formStepLine(step: number): string {
  return formSteps
    .map((label, index) => (index === step ? solid(`${index + 1} ${label}`, "cyan") : style.gray(`${index + 1} ${label}`)))
    .join(style.gray("  "));
}

const formSteps = ["name", "cwd", "agent", "resume", "objective", "tags", "start"] as const;

function formStepTitle(step: number): string {
  return `${style.bold("Create session")} ${style.gray(`step ${step + 1}/${formSteps.length}`)}`;
}

function startupPreview(state: NewSessionFormState): string {
  if (state.kind === "shell") {
    return "tmux shell";
  }
  if (state.kind === "codex") {
    return state.resume ? "codex resume" : "codex";
  }
  return state.resume ? "claude -r" : "claude";
}

function fitFormBody(
  fullBody: string[],
  fieldRows: string[],
  state: NewSessionFormState,
  cwd: string,
  contentHeight: number
): string[] {
  if (fullBody.length <= contentHeight) {
    return fullBody;
  }

  const activeField = fieldRows[state.step] ?? fieldRows[0]!;
  const previous = fieldRows[state.step - 1];
  const next = fieldRows[state.step + 1];
  const compact = [
    formStepTitle(state.step),
    formStepLine(state.step),
    "",
    previous ? style.dim(previous) : field("cwd", shortenPath(cwd)),
    activeField,
    next ? style.dim(next) : field("startup", startupPreview(state)),
    "",
    style.dim("Enter next/confirm  ·  Up/Down move  ·  Esc cancel")
  ];
  return compact.slice(0, Math.max(1, contentHeight));
}

export function formatNewSessionForm(options: {
  state: NewSessionFormState;
  cwd: string;
  cwdSuggestion?: string;
  activeCount: number;
  config: SmuxConfig;
}): string {
  const width = terminalWidth();
  const height = terminalHeight();
  const state = options.state;
  const header = formTopBar(width, options.activeCount, options.config);
  const formWidth = Math.min(width, Math.max(60, Math.min(96, width - 4)));
  const leftPad = Math.max(0, Math.floor((width - formWidth) / 2));
  const spacer = " ".repeat(leftPad);
  const kindLine = `${state.step === 2 ? style.cyan("›") : " "} ${padEndVisible("agent", 18)} ${segmentedKind(state.kind, state.step === 2)} ${style.dim("left/right or hotkey")}`;
  const canResume = state.kind !== "shell";
  const resumeHint = state.kind === "codex"
    ? "starts codex resume"
    : state.kind === "claude"
      ? "starts claude -r"
      : "agent sessions only";
  const resumeLine = checkboxLine("resume previous", state.resume, state.step === 3, canResume, resumeHint);
  const canSendObjective = state.kind !== "shell" && !state.resume && state.objective.trim().length > 0;
  const sendValue = !canSendObjective
    ? style.gray("disabled")
    : state.sendObjective
      ? style.green("send objective")
      : style.gray("do not send");
  const sendHint = state.resume
    ? "disabled while resume is on"
    : canSendObjective
      ? "space toggles"
      : "requires agent objective";
  const sendLine = `${state.step === 6 ? style.cyan("›") : " "} ${padEndVisible("initial prompt", 18)} ${sendValue} ${style.dim(sendHint)}`;
  const fieldRows = [
    inputLine("name", state.name, state.step === 0, "editable"),
    inputLine("cwd", state.cwd, state.step === 1, options.cwdSuggestion ? "tab completes" : "editable path", options.cwdSuggestion),
    kindLine,
    resumeLine,
    inputLine("objective", state.objective, state.step === 4, "optional"),
    inputLine("tags", state.tags, state.step === 5, "comma separated"),
    sendLine
  ];
  const body = [
    formStepTitle(state.step),
    formStepLine(state.step),
    field("launch", displayPath(state.cwd || options.cwd)),
    field("startup", startupPreview(state)),
    "",
    ...fieldRows,
    "",
    style.dim("Enter next/confirm  ·  Up/Down move  ·  Esc cancel")
  ];
  const boxHeight = Math.max(7, height - 4);
  const visibleBody = fitFormBody(body, fieldRows, state, options.cwd, boxHeight - 2);
  const rows = boxLines("new session", visibleBody, formWidth, boxHeight).map((line) => `${spacer}${line}`);
  const footerText = width < 64
    ? " enter next   tab complete   esc cancel"
    : " enter next/confirm   tab complete/move   ↑/↓ move   ←/→ agent   space toggle   esc cancel";
  const footer = style.inverse(fillLine(footerText, width));

  return [header, "", ...rows, "", footer].join("\n");
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

  return boxLines(`${style.cyan("focus")} ${session.name}`, [
    field("cwd", shortenPath(session.cwd)),
    field("git", git),
    field("tmux", session.status),
    field("startup", startupLabel(session)),
    field("scroll", tmux),
    field("objective", session.objective || style.gray("-")),
    field("tags", tags),
    "",
    sectionTitle("last preview"),
    preview,
    "",
    sectionTitle("notes"),
    notes
  ], terminalWidth(), Math.max(8, terminalHeight() - 1)).join("\n");
}

export function formatHelp(): string {
  return boxLines(`${style.cyan("smux")} command reference`, [
    `${solid("◆ smux", "cyan")} ${style.bold("agent cockpit for tmux")}`,
    style.dim("Manage Claude, Codex, and shell workspaces without losing context."),
    "",
    sectionTitle("usage"),
    `  ${style.bold("smux")}                                      ${style.dim("open the session dashboard")}`,
    `  ${style.bold("smux list")} [--view recent|path|kind|waiting] ${style.dim("show sessions")}`,
    `  ${style.bold("smux new")} [--kind codex|claude|shell]       ${style.dim("create a session")}`,
    `            [--name NAME] [--cwd DIR] [--objective TEXT] [--resume]`,
    `            [--send-objective]`,
    `            [--history-limit N] [--mouse|--no-mouse]`,
    `  ${style.bold("smux attach")} <name-or-id>                   ${style.dim("attach to tmux")}`,
    `  ${style.bold("smux status")} <name-or-id>                   ${style.dim("inspect without attaching")}`,
    `  ${style.bold("smux send")} <name-or-id> <message>           ${style.dim("send a confirmed prompt")}`,
    `  ${style.bold("smux rename")} <new-name> [name-or-id]        ${style.dim("sync smux and tmux names")}`,
    `  ${style.bold("smux config")}                                ${style.dim("show global settings")}`,
    `  ${style.bold("smux config set")} <key> <value>              ${style.dim("set global defaults")}`,
    `  ${style.bold("smux set")} <session> <key> <value>           ${style.dim("set a session override")}`,
    `  ${style.bold("smux kill")} <name-or-id>                     ${style.dim("terminate a session")}`,
    `  ${style.bold("smux killall")} [--yes]                        ${style.dim("terminate all active sessions")}`,
    "",
    sectionTitle("views"),
    `  ${key("r")} recent   ${key("p")} path   ${key("a")} agent   ${key("w")} waiting`,
    "",
    sectionTitle("config keys"),
    "  fullscreen",
    "  tmux.history-limit",
    "  tmux.mouse",
    "  tmux.mode-keys",
    "",
    style.dim("Package: smux-ai, binary: smux")
  ], terminalWidth()).join("\n");
}

export function formatConfig(config: SmuxConfig, path: string): string {
  return boxLines(`${style.cyan("smux")} config`, [
    `${solid("global", "cyan")} ${style.bold("defaults")}`,
    "",
    field("path", path),
    field("fullscreen", config.fullscreen ? style.green("on") : style.gray("off")),
    field("tmux.history-limit", style.yellow(String(config.tmux.historyLimit))),
    field("tmux.mouse", config.tmux.mouse ? style.green("on") : style.gray("off")),
    field("tmux.mode-keys", config.tmux.modeKeys),
    "",
    sectionTitle("commands"),
    style.dim("smux config set tmux.history-limit 200000"),
    style.dim("smux config set tmux.mouse on")
  ], terminalWidth(), Math.max(8, terminalHeight() - 1)).join("\n");
}

export function formatSessionConfig(session: SmuxSession, effective: Required<TmuxOptions>): string {
  return boxLines(`${style.cyan("session")} config ${session.name}`, [
    `${kindBadge(session.kind)} ${statusBadge(session.agentStatus)} ${style.gray(session.status)}`,
    "",
    field("tmux.history-limit", String(session.tmux?.historyLimit ?? `${effective.historyLimit} (global)`)),
    field("tmux.mouse", session.tmux?.mouse === undefined ? `${effective.mouse ? "on" : "off"} (global)` : session.tmux.mouse ? "on" : "off"),
    field("tmux.mode-keys", session.tmux?.modeKeys ?? `${effective.modeKeys} (global)`),
    "",
    style.dim(`smux set ${session.name} tmux.history-limit 300000`)
  ], terminalWidth(), Math.max(7, terminalHeight() - 1)).join("\n");
}
