import { capturePreview, listTmuxSessions, paneCurrentPath } from "./tmux.js";
import type { AgentStatus, SmuxSession, SmuxState, TmuxSession } from "./types.js";

function isoFromEpoch(epoch?: number): string | undefined {
  if (!epoch) {
    return undefined;
  }
  return new Date(epoch * 1000).toISOString();
}

function statusFromTmux(session?: TmuxSession, current?: SmuxSession): SmuxSession["status"] {
  if (!session) {
    return current?.status === "terminated" ? "terminated" : "missing";
  }
  return session.attached ? "attached" : "detached";
}

function inferAgentStatus(session?: TmuxSession, current?: SmuxSession): AgentStatus {
  if (!session) {
    return current?.agentStatus === "done" || current?.agentStatus === "blocked"
      ? current.agentStatus
      : "unknown";
  }
  if (current?.kind === "shell") {
    return session.attached ? "running" : "idle";
  }
  if (current?.agentStatus === "blocked" || current?.agentStatus === "done") {
    return current.agentStatus;
  }
  return session.attached ? "running" : "waiting";
}

export function reconcile(state: SmuxState): SmuxState {
  const tmuxSessions = listTmuxSessions();
  const byId = new Map(tmuxSessions.map((session) => [session.id, session]));
  const byName = new Map(tmuxSessions.map((session) => [session.name, session]));
  const now = new Date().toISOString();

  const knownTmuxIds = new Set<string>();
  const sessions = state.sessions.map((session) => {
    const tmux = session.tmuxSessionId
      ? byId.get(session.tmuxSessionId)
      : byName.get(session.tmuxSessionName);

    if (tmux) {
      knownTmuxIds.add(tmux.id);
    }

    const target = tmux?.id ?? session.tmuxSessionId ?? session.tmuxSessionName;
    const cwd = tmux ? paneCurrentPath(target) ?? session.cwd : session.cwd;
    const lastPreview = tmux ? capturePreview(target) || session.lastPreview : session.lastPreview;

    return {
      ...session,
      name: tmux && tmux.name !== session.tmuxSessionName ? tmux.name : session.name,
      cwd,
      tmuxSessionId: tmux?.id ?? session.tmuxSessionId,
      tmuxSessionName: tmux?.name ?? session.tmuxSessionName,
      status: statusFromTmux(tmux, session),
      agentStatus: inferAgentStatus(tmux, session),
      lastPreview,
      lastAttachedAt: isoFromEpoch(tmux?.lastAttachedAtEpoch) ?? session.lastAttachedAt,
      updatedAt: now
    };
  });

  for (const tmux of tmuxSessions) {
    if (knownTmuxIds.has(tmux.id)) {
      continue;
    }

    sessions.push({
      id: `tmux_${tmux.id.replace(/[^a-zA-Z0-9_-]/g, "")}`,
      name: tmux.name,
      kind: "shell",
      objective: "",
      tags: [],
      agentStatus: tmux.attached ? "running" : "idle",
      cwd: paneCurrentPath(tmux.id) ?? process.cwd(),
      tmuxSessionId: tmux.id,
      tmuxSessionName: tmux.name,
      status: tmux.attached ? "attached" : "detached",
      lastPreview: capturePreview(tmux.id),
      notes: [],
      createdAt: isoFromEpoch(tmux.createdAtEpoch) ?? now,
      updatedAt: now,
      lastAttachedAt: isoFromEpoch(tmux.lastAttachedAtEpoch)
    });
  }

  return {
    ...state,
    sessions
  };
}
