import type { SmuxSession, SmuxState } from "./types.js";

function hasSessionTarget(session: SmuxSession): boolean {
  return Boolean(session.name && (session.tmuxSessionId || session.tmuxSessionName));
}

export function activeSessions(state: SmuxState): SmuxSession[] {
  return state.sessions.filter(
    (session) => hasSessionTarget(session) && session.status !== "terminated" && session.status !== "missing"
  );
}

export function resolveSession(state: SmuxState, query: string): SmuxSession {
  const sessions = activeSessions(state);
  const exact = sessions.find(
    (session) =>
      session.id === query ||
      session.name === query ||
      session.tmuxSessionId === query ||
      session.tmuxSessionName === query
  );
  if (exact) {
    return exact;
  }

  const partial = sessions.filter((session) => session.name.includes(query));
  if (partial.length === 1) {
    return partial[0]!;
  }
  if (partial.length > 1) {
    throw new Error(`Multiple sessions match "${query}": ${partial.map((s) => s.name).join(", ")}`);
  }
  throw new Error(`No active session matches "${query}".`);
}

export function tmuxTarget(session: SmuxSession): string {
  return session.tmuxSessionId ?? session.tmuxSessionName;
}
