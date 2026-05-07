import { formatStatus } from "../core/format.js";
import { resolveSession } from "../core/resolve.js";
import type { CommandContext } from "./context.js";

export function statusCommand(context: CommandContext, query: string): void {
  context.save(context.state);
  console.log(formatStatus(resolveSession(context.state, query)));
}
