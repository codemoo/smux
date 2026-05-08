import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { AgentStatus, SessionKind, SmuxSession, SmuxState, TmuxOptions } from "./types.js";

const CURRENT_VERSION = 1;

export function stateFilePath(): string {
  return process.env.SMUX_STATE_FILE ?? join(homedir(), ".config", "smux", "state.json");
}

export function emptyState(): SmuxState {
  return {
    version: CURRENT_VERSION,
    sessions: []
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function sessionKind(value: unknown): SessionKind | undefined {
  return value === "claude" || value === "codex" || value === "shell" ? value : undefined;
}

function agentStatus(value: unknown): AgentStatus {
  if (
    value === "idle" ||
    value === "running" ||
    value === "waiting" ||
    value === "blocked" ||
    value === "done" ||
    value === "unknown"
  ) {
    return value;
  }
  return "unknown";
}

function sessionStatus(value: unknown): SmuxSession["status"] {
  if (value === "attached" || value === "detached" || value === "missing" || value === "terminated") {
    return value;
  }
  return "missing";
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function tmuxOptions(value: unknown): TmuxOptions | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const raw = value as Partial<TmuxOptions>;
  const options: TmuxOptions = {};
  if (typeof raw.historyLimit === "number" && Number.isInteger(raw.historyLimit) && raw.historyLimit >= 2_000) {
    options.historyLimit = raw.historyLimit;
  }
  if (typeof raw.mouse === "boolean") {
    options.mouse = raw.mouse;
  }
  if (raw.modeKeys === "vi" || raw.modeKeys === "emacs") {
    options.modeKeys = raw.modeKeys;
  }
  return Object.keys(options).length > 0 ? options : undefined;
}

function normalizeSession(value: unknown): SmuxSession | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const session = value as Partial<SmuxSession>;
  const name = stringValue(session.name) ?? stringValue(session.tmuxSessionName);
  const tmuxSessionName = stringValue(session.tmuxSessionName) ?? name;
  const id = stringValue(session.id);
  const kind = sessionKind(session.kind);
  const cwd = stringValue(session.cwd);
  const createdAt = stringValue(session.createdAt);
  const updatedAt = stringValue(session.updatedAt) ?? createdAt;
  if (!id || !name || !tmuxSessionName || !kind || !cwd || !createdAt || !updatedAt) {
    return undefined;
  }

  return {
    id,
    name,
    kind,
    resume: session.resume ?? false,
    agentStatus: agentStatus(session.agentStatus),
    cwd,
    repoRoot: stringValue(session.repoRoot),
    gitBranch: stringValue(session.gitBranch),
    gitDirty: booleanValue(session.gitDirty),
    tmuxSessionId: stringValue(session.tmuxSessionId),
    tmuxSessionName,
    tmux: tmuxOptions(session.tmux),
    status: sessionStatus(session.status),
    lastPreview: stringValue(session.lastPreview),
    createdAt,
    updatedAt,
    lastAttachedAt: stringValue(session.lastAttachedAt)
  };
}

export function loadState(path = stateFilePath()): SmuxState {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<SmuxState>;
    if (parsed.version !== CURRENT_VERSION || !Array.isArray(parsed.sessions)) {
      return emptyState();
    }
    return {
      version: CURRENT_VERSION,
      sessions: parsed.sessions
        .map((session) => normalizeSession(session))
        .filter((session): session is SmuxSession => session !== undefined)
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyState();
    }
    throw error;
  }
}

export function saveState(state: SmuxState, path = stateFilePath()): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, path);
}

export function upsertSession(state: SmuxState, session: SmuxSession): SmuxState {
  const index = state.sessions.findIndex((item) => item.id === session.id);
  if (index === -1) {
    return {
      ...state,
      sessions: [...state.sessions, session]
    };
  }

  const sessions = [...state.sessions];
  sessions[index] = session;
  return {
    ...state,
    sessions
  };
}
