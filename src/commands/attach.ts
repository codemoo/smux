import { attachTmuxSession } from "../core/tmux.js";
import { resolveSession, tmuxTarget } from "../core/resolve.js";
import { upsertSession } from "../core/store.js";
import type { CommandContext } from "./context.js";

export async function attachCommand(context: CommandContext, query: string): Promise<void> {
  const session = resolveSession(context.state, query);
  const now = new Date().toISOString();
  const updated = {
    ...session,
    lastAttachedAt: now,
    updatedAt: now
  };
  context.save(upsertSession(context.state, updated));
  const code = await attachTmuxSession(tmuxTarget(updated));
  if (code !== 0) {
    process.exitCode = code;
  }
}
