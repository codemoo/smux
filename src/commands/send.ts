import { pasteMessage } from "../core/tmux.js";
import { resolveSession, tmuxTarget } from "../core/resolve.js";
import type { CommandContext } from "./context.js";

export interface SendOptions {
  yes?: boolean;
  allowShell?: boolean;
}

export function sendCommandToSession(
  context: CommandContext,
  query: string,
  message: string,
  options: SendOptions = {}
): void {
  const session = resolveSession(context.state, query);
  if (session.kind === "shell" && !options.allowShell) {
    throw new Error("Refusing to send to a shell session without --allow-shell.");
  }
  pasteMessage(tmuxTarget(session), message);
  console.log(`Sent message to ${session.name}.`);
}
