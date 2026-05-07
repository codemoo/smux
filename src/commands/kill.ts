import { killTmuxSession } from "../core/tmux.js";
import { activeSessions, resolveSession, tmuxTarget } from "../core/resolve.js";
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

export function killAllCommand(context: CommandContext): void {
  const sessions = activeSessions(context.state);
  if (sessions.length === 0) {
    console.log("No active sessions to kill.");
    return;
  }

  const now = new Date().toISOString();
  let nextState = context.state;
  const failures: string[] = [];
  let killed = 0;

  for (const session of sessions) {
    try {
      killTmuxSession(tmuxTarget(session));
      nextState = upsertSession(nextState, {
        ...session,
        status: "terminated",
        agentStatus: "done",
        updatedAt: now
      });
      killed += 1;
    } catch (error) {
      failures.push(`${session.name}: ${(error as Error).message}`);
    }
  }

  context.save(nextState);
  console.log(`Killed ${killed} session${killed === 1 ? "" : "s"}.`);
  if (failures.length > 0) {
    throw new Error(`Failed to kill ${failures.length} session${failures.length === 1 ? "" : "s"}:\n${failures.join("\n")}`);
  }
}
