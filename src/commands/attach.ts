import { effectiveTmuxOptions } from "../core/config.js";
import { applyTmuxOptions, attachTmuxSession } from "../core/tmux.js";
import { resolveSession, tmuxTarget } from "../core/resolve.js";
import { upsertSession } from "../core/store.js";
import type { CommandContext } from "./context.js";

export async function attachCommand(context: CommandContext, query: string): Promise<void> {
  const session = resolveSession(context.state, query);
  const now = new Date().toISOString();
  const target = tmuxTarget(session);
  applyTmuxOptions(target, effectiveTmuxOptions(context.config, session.tmux));
  const code = await attachTmuxSession(target);
  if (code !== 0) {
    throw new Error(`tmux attach-session failed for "${session.name}" with exit code ${code}.`);
  }
  const updated = {
    ...session,
    lastAttachedAt: now,
    updatedAt: now
  };
  context.save(upsertSession(context.state, updated));
}
