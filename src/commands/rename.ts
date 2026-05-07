import { renameTmuxSession } from "../core/tmux.js";
import { resolveSession, tmuxTarget } from "../core/resolve.js";
import { upsertSession } from "../core/store.js";
import type { CommandContext } from "./context.js";

export function renameCommand(context: CommandContext, nextName: string, query?: string): void {
  const sessionId = query ?? process.env.SMUX_SESSION_ID;
  if (!sessionId) {
    throw new Error("Pass a session name/id or run inside a smux-managed tmux session.");
  }

  const session = resolveSession(context.state, sessionId);
  renameTmuxSession(tmuxTarget(session), nextName);
  const now = new Date().toISOString();
  const updated = {
    ...session,
    name: nextName,
    tmuxSessionName: nextName,
    updatedAt: now
  };
  context.save(upsertSession(context.state, updated));
  console.log(`Renamed ${session.name} to ${nextName}.`);
}
