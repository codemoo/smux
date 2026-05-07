import { basename } from "node:path";
import { createSessionId } from "../core/id.js";
import { gitInfo } from "../core/git.js";
import { createTmuxSession, sendCommand, attachTmuxSession } from "../core/tmux.js";
import { upsertSession } from "../core/store.js";
import type { SessionKind, SmuxSession } from "../core/types.js";
import type { CommandContext } from "./context.js";

export interface NewSessionOptions {
  name?: string;
  kind?: SessionKind;
  objective?: string;
  tags?: string[];
  cwd?: string;
  attach?: boolean;
  sendObjective?: boolean;
}

function uniqueName(base: string, existingNames: Set<string>): string {
  if (!existingNames.has(base)) {
    return base;
  }
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existingNames.has(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Could not create a unique session name from "${base}".`);
}

export async function newCommand(context: CommandContext, options: NewSessionOptions): Promise<SmuxSession> {
  const cwd = options.cwd ?? process.cwd();
  const kind = options.kind ?? "shell";
  const existingNames = new Set(context.state.sessions.map((session) => session.tmuxSessionName));
  const name = uniqueName(options.name ?? basename(cwd), existingNames);
  const id = createSessionId();
  const now = new Date().toISOString();
  const git = gitInfo(cwd);

  createTmuxSession({
    name,
    cwd,
    smuxSessionId: id,
    kind
  });

  if (kind !== "shell") {
    sendCommand(name, kind);
    if (options.objective && options.sendObjective) {
      sendCommand(name, options.objective);
    }
  }

  const session: SmuxSession = {
    id,
    name,
    kind,
    objective: options.objective ?? "",
    tags: options.tags ?? [],
    agentStatus: kind === "shell" ? "idle" : "running",
    cwd,
    repoRoot: git.repoRoot,
    gitBranch: git.branch,
    gitDirty: git.dirty,
    tmuxSessionName: name,
    status: "detached",
    notes: [],
    createdAt: now,
    updatedAt: now,
    lastAttachedAt: options.attach === false ? undefined : now
  };

  const nextState = upsertSession(context.state, session);
  context.save(nextState);

  if (options.attach !== false) {
    const code = await attachTmuxSession(name);
    if (code !== 0) {
      process.exitCode = code;
    }
  }

  return session;
}
