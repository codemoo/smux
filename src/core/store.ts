import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { SmuxSession, SmuxState } from "./types.js";

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

export function loadState(path = stateFilePath()): SmuxState {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<SmuxState>;
    if (parsed.version !== CURRENT_VERSION || !Array.isArray(parsed.sessions)) {
      return emptyState();
    }
    return {
      version: CURRENT_VERSION,
      sessions: parsed.sessions.map((session) => ({
        ...session,
        resume: session.resume ?? false
      })) as SmuxSession[]
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
