import { resolveSession } from "../core/resolve.js";
import { upsertSession } from "../core/store.js";
import type { CommandContext } from "./context.js";

export function tagCommand(context: CommandContext, query: string, tags: string[]): void {
  const session = resolveSession(context.state, query);
  const now = new Date().toISOString();
  const nextTags = [...new Set([...session.tags, ...tags])];
  context.save(
    upsertSession(context.state, {
      ...session,
      tags: nextTags,
      updatedAt: now
    })
  );
  console.log(`Updated tags for ${session.name}: ${nextTags.join(", ") || "-"}`);
}
