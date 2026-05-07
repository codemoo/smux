import { activeSessions } from "../core/resolve.js";
import { formatList } from "../core/format.js";
import type { ListView } from "../core/types.js";
import type { CommandContext } from "./context.js";

export function listCommand(context: CommandContext, view: ListView = "recent"): void {
  context.save(context.state);
  console.log(formatList(activeSessions(context.state), view));
}
