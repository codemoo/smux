import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { run } from "./process.js";
import type { SmuxSession } from "./types.js";

export interface TokenUsageSummary {
  source: "claude" | "codex";
  total: number;
  today: number;
  last5h: number;
  available: boolean;
}

interface TokenEvent {
  timestamp: number;
  tokens: number;
}

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;

function emptyUsage(source: "claude" | "codex"): TokenUsageSummary {
  return {
    source,
    total: 0,
    today: 0,
    last5h: 0,
    available: false
  };
}

function summarize(source: "claude" | "codex", events: TokenEvent[]): TokenUsageSummary {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return {
    source,
    total: events.reduce((sum, event) => sum + event.tokens, 0),
    today: events
      .filter((event) => event.timestamp >= todayStart.getTime())
      .reduce((sum, event) => sum + event.tokens, 0),
    last5h: events
      .filter((event) => now - event.timestamp <= FIVE_HOURS_MS)
      .reduce((sum, event) => sum + event.tokens, 0),
    available: events.length > 0
  };
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function claudeProjectKey(cwd: string): string {
  return cwd.replaceAll("/", "-");
}

function claudeTokenUsage(cwd: string): TokenUsageSummary {
  const dir = join(homedir(), ".claude", "projects", claudeProjectKey(cwd));
  if (!existsSync(dir)) {
    return emptyUsage("claude");
  }

  const events: TokenEvent[] = [];
  const seen = new Set<string>();
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".jsonl"))) {
    const path = join(dir, file);
    try {
      for (const line of readFileSync(path, "utf8").split("\n")) {
        if (!line.includes("\"usage\"")) {
          continue;
        }
        const entry = JSON.parse(line) as {
          cwd?: string;
          requestId?: string;
          timestamp?: string;
          message?: {
            id?: string;
            usage?: Record<string, unknown>;
          };
        };
        if (entry.cwd && entry.cwd !== cwd) {
          continue;
        }
        const usage = entry.message?.usage;
        if (!usage) {
          continue;
        }
        const key = entry.requestId || entry.message?.id
          ? `${entry.requestId ?? ""}:${entry.message?.id ?? ""}`
          : `${path}:${entry.timestamp ?? ""}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const tokens =
          numberValue(usage.input_tokens) +
          numberValue(usage.output_tokens) +
          numberValue(usage.cache_creation_input_tokens) +
          numberValue(usage.cache_read_input_tokens);
        const timestamp = entry.timestamp ? new Date(entry.timestamp).getTime() : statSync(path).mtimeMs;
        if (tokens > 0 && Number.isFinite(timestamp)) {
          events.push({ timestamp, tokens });
        }
      }
    } catch {
      continue;
    }
  }

  return summarize("claude", events);
}

function sqlEscape(value: string): string {
  return value.replaceAll("'", "''");
}

function codexThreadIdsForCwd(cwd: string): Set<string> {
  const db = join(homedir(), ".codex", "logs_2.sqlite");
  if (!existsSync(db)) {
    return new Set();
  }
  const query = [
    "select distinct thread_id from logs",
    `where thread_id is not null and feedback_log_body like '%cwd=${sqlEscape(cwd)}%'`,
    "order by ts desc limit 2000;"
  ].join(" ");
  const result = run("sqlite3", ["-separator", "\t", db, query]);
  if (result.status !== 0) {
    return new Set();
  }

  const ids = new Set<string>();
  for (const line of result.stdout.split("\n")) {
    const id = line.trim();
    if (/^[0-9a-f-]+$/.test(id)) {
      ids.add(id);
    }
  }
  return ids;
}

function codexTokenUsage(cwd: string): TokenUsageSummary {
  const db = join(homedir(), ".codex", "logs_2.sqlite");
  if (!existsSync(db)) {
    return emptyUsage("codex");
  }
  const threadIds = codexThreadIdsForCwd(cwd);
  if (threadIds.size === 0) {
    return emptyUsage("codex");
  }

  const threadList = [...threadIds].map((id) => `'${sqlEscape(id)}'`).join(",");
  const query = [
    "select ts, thread_id, feedback_log_body from logs",
    `where thread_id in (${threadList})`,
    "and target = 'codex_core::session::turn'",
    "and feedback_log_body like '%post sampling token usage turn_id=%'",
    "order by ts desc limit 5000;"
  ].join(" ");
  const result = run("sqlite3", ["-separator", "\t", db, query]);
  if (result.status !== 0) {
    return emptyUsage("codex");
  }

  const events: TokenEvent[] = [];
  const seenTurns = new Set<string>();
  for (const line of result.stdout.split("\n")) {
    const [ts, threadId, ...bodyParts] = line.split("\t");
    const body = bodyParts.join("\t");
    if (!ts || !threadId || !body) {
      continue;
    }
    if (!threadId || !threadIds.has(threadId)) {
      continue;
    }
    const turnId = body.match(/turn_id=([0-9a-f-]+)/)?.[1];
    if (turnId && seenTurns.has(turnId)) {
      continue;
    }
    if (turnId) {
      seenTurns.add(turnId);
    }
    const tokens = Number(body.match(/total_usage_tokens=(\d+)/)?.[1] ?? 0);
    const timestamp = Number(ts) * 1000;
    if (tokens > 0 && Number.isFinite(timestamp)) {
      events.push({ timestamp, tokens });
    }
  }

  return summarize("codex", events);
}

export function tokenUsageForSession(session?: SmuxSession): TokenUsageSummary | undefined {
  if (!session || session.kind === "shell") {
    return undefined;
  }
  if (session.kind === "claude") {
    return claudeTokenUsage(session.cwd);
  }
  return codexTokenUsage(session.cwd);
}
