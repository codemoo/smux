#!/usr/bin/env node
import { attachCommand } from "./commands/attach.js";
import { setConfigCommand, setSessionConfigCommand, showConfigCommand } from "./commands/config.js";
import { loadContext } from "./commands/context.js";
import { killCommand } from "./commands/kill.js";
import { listCommand } from "./commands/list.js";
import { newCommand } from "./commands/new.js";
import { noteCommand } from "./commands/note.js";
import { renameCommand } from "./commands/rename.js";
import { sendCommandToSession } from "./commands/send.js";
import { statusCommand } from "./commands/status.js";
import { tagCommand } from "./commands/tag.js";
import { applyTmuxOptions, ensureTmuxAvailable } from "./core/tmux.js";
import { formatHelp } from "./core/format.js";
import type { ListView, SessionKind, TmuxOptions } from "./core/types.js";
import { confirm } from "./tui/prompt.js";
import { runMainMenu } from "./tui/main-menu.js";

interface ParsedArgs {
  positional: string[];
  flags: Map<string, string | boolean>;
}

function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | boolean>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = rawKey!;
    if (inlineValue !== undefined) {
      flags.set(key, inlineValue);
      continue;
    }

    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      flags.set(key, next);
      index += 1;
    } else {
      flags.set(key, true);
    }
  }

  return { positional, flags };
}

function flagString(flags: Map<string, string | boolean>, key: string): string | undefined {
  const value = flags.get(key);
  return typeof value === "string" ? value : undefined;
}

function flagBoolean(flags: Map<string, string | boolean>, key: string): boolean {
  return flags.get(key) === true;
}

function parseKind(value?: string): SessionKind | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "claude" || value === "codex" || value === "shell") {
    return value;
  }
  throw new Error(`Invalid --kind "${value}". Use claude, codex, or shell.`);
}

function parseView(value?: string): ListView {
  if (value === undefined) {
    return "recent";
  }
  if (value === "recent" || value === "path" || value === "kind" || value === "waiting") {
    return value;
  }
  throw new Error(`Invalid --view "${value}". Use recent, path, kind, or waiting.`);
}

function usage(): string {
  return formatHelp();
}

function parseTmuxFlags(flags: Map<string, string | boolean>): TmuxOptions | undefined {
  const options: TmuxOptions = {};
  const historyLimit = flagString(flags, "history-limit");
  if (historyLimit !== undefined) {
    const parsed = Number(historyLimit);
    if (!Number.isInteger(parsed) || parsed < 2_000) {
      throw new Error("--history-limit must be an integer >= 2000.");
    }
    options.historyLimit = parsed;
  }
  if (flagBoolean(flags, "mouse")) {
    options.mouse = true;
  }
  if (flagBoolean(flags, "no-mouse")) {
    options.mouse = false;
  }
  const modeKeys = flagString(flags, "mode-keys");
  if (modeKeys !== undefined) {
    if (modeKeys !== "vi" && modeKeys !== "emacs") {
      throw new Error("--mode-keys must be vi or emacs.");
    }
    options.modeKeys = modeKeys;
  }
  return Object.keys(options).length > 0 ? options : undefined;
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const [command, ...rest] = parsed.positional;

  if (command === "help" || command === "--help" || command === "-h" || flagBoolean(parsed.flags, "help")) {
    console.log(usage());
    return;
  }

  ensureTmuxAvailable();
  const context = loadContext();
  applyTmuxOptions(undefined, context.config.tmux);

  if (!command) {
    await runMainMenu(context);
    return;
  }

  switch (command) {
    case "list":
      listCommand(context, parseView(flagString(parsed.flags, "view")));
      return;

    case "new": {
      const tags = parsed.positional
        .slice(1)
        .filter((item) => item !== "new");
      const flagTag = flagString(parsed.flags, "tag");
      await newCommand(context, {
        name: flagString(parsed.flags, "name"),
        kind: parseKind(flagString(parsed.flags, "kind")),
        cwd: flagString(parsed.flags, "cwd"),
        objective: flagString(parsed.flags, "objective"),
        tags: flagTag ? [...tags, flagTag] : tags,
        attach: !flagBoolean(parsed.flags, "no-attach"),
        sendObjective: flagBoolean(parsed.flags, "send-objective"),
        resume: flagBoolean(parsed.flags, "resume"),
        tmux: parseTmuxFlags(parsed.flags)
      });
      return;
    }

    case "attach":
      if (!rest[0]) {
        throw new Error("attach requires a session name or id.");
      }
      await attachCommand(context, rest[0]);
      return;

    case "status":
      if (!rest[0]) {
        throw new Error("status requires a session name or id.");
      }
      statusCommand(context, rest[0]);
      return;

    case "send": {
      if (!rest[0] || rest.length < 2) {
        throw new Error("send requires a session name/id and a message.");
      }
      const [target, ...messageParts] = rest;
      const message = messageParts.join(" ");
      if (!flagBoolean(parsed.flags, "yes") && !(await confirm(`Send to ${target}?`, false))) {
        return;
      }
      sendCommandToSession(context, target!, message, {
        yes: flagBoolean(parsed.flags, "yes"),
        allowShell: flagBoolean(parsed.flags, "allow-shell")
      });
      return;
    }

    case "note":
      if (!rest[0] || rest.length < 2) {
        throw new Error("note requires a session name/id and text.");
      }
      noteCommand(context, rest[0], rest.slice(1).join(" "));
      return;

    case "tag":
      if (!rest[0] || rest.length < 2) {
        throw new Error("tag requires a session name/id and one or more tags.");
      }
      tagCommand(context, rest[0], rest.slice(1));
      return;

    case "rename":
      if (!rest[0]) {
        throw new Error("rename requires a new name.");
      }
      renameCommand(context, rest[0], rest[1]);
      return;

    case "config":
      if (!rest[0]) {
        showConfigCommand(context);
        return;
      }
      if (rest[0] === "set") {
        if (!rest[1] || !rest[2]) {
          throw new Error("config set requires a key and value.");
        }
        setConfigCommand(context, rest[1], rest[2]);
        return;
      }
      throw new Error(`Unknown config command "${rest[0]}".`);

    case "set":
      if (!rest[0] || !rest[1] || !rest[2]) {
        throw new Error("set requires a session, key, and value.");
      }
      setSessionConfigCommand(context, rest[0], rest[1], rest[2]);
      return;

    case "kill":
      if (!rest[0]) {
        throw new Error("kill requires a session name or id.");
      }
      if (!flagBoolean(parsed.flags, "yes") && !(await confirm(`Kill ${rest[0]}?`, false))) {
        return;
      }
      killCommand(context, rest[0]);
      return;

    default:
      throw new Error(`Unknown command "${command}".\n\n${usage()}`);
  }
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
