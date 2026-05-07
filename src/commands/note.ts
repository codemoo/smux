import { resolveSession } from "../core/resolve.js";
import { upsertSession } from "../core/store.js";
import type { CommandContext } from "./context.js";

export function noteCommand(context: CommandContext, query: string, text: string): void {
  const session = resolveSession(context.state, query);
  const now = new Date().toISOString();
  context.save(
    upsertSession(context.state, {
      ...session,
      notes: [...session.notes, { text, createdAt: now }],
      updatedAt: now
    })
  );
  console.log(`Added note to ${session.name}.`);
}
