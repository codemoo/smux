import { killTmuxSession } from "../core/tmux.js";
import { resolveSession, tmuxTarget } from "../core/resolve.js";
import { upsertSession } from "../core/store.js";
import type { CommandContext } from "./context.js";

export function killCommand(context: CommandContext, query: string): void {
  const session = resolveSession(context.state, query);
  killTmuxSession(tmuxTarget(session));
  const now = new Date().toISOString();
  context.save(
    upsertSession(context.state, {
      ...session,
      status: "terminated",
      agentStatus: "done",
      updatedAt: now
    })
  );
  console.log(`Killed ${session.name}.`);
}
