import { basename } from "node:path";
import { attachCommand } from "../commands/attach.js";
import { killCommand } from "../commands/kill.js";
import { newCommand } from "../commands/new.js";
import { sendCommandToSession } from "../commands/send.js";
import { statusCommand } from "../commands/status.js";
import { activeSessions } from "../core/resolve.js";
import { formatList, sortRecent } from "../core/format.js";
import type { CommandContext } from "../commands/context.js";
import type { ListView, SessionKind, SmuxSession } from "../core/types.js";
import { ask, confirm } from "./prompt.js";

function parseKind(value: string): SessionKind {
  if (value === "claude" || value === "codex" || value === "shell") {
    return value;
  }
  throw new Error(`Invalid kind "${value}". Use claude, codex, or shell.`);
}

function selectedSession(sessions: SmuxSession[], token: string): SmuxSession {
  const index = Number(token);
  if (!Number.isInteger(index) || index < 1 || index > sessions.length) {
    throw new Error(`Invalid selection "${token}".`);
  }
  return sessions[index - 1]!;
}

async function createSessionFlow(context: CommandContext): Promise<void> {
  const cwd = process.cwd();
  const name = await ask("Session name", basename(cwd));
  const objective = await ask("Objective");
  const kind = parseKind(await ask("Kind: claude, codex, shell", "codex"));
  const tags = (await ask("Tags, comma separated"))
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const sendObjective =
    kind !== "shell" && objective ? await confirm("Send objective as the first agent prompt?", true) : false;

  await newCommand(context, {
    name,
    objective,
    kind,
    tags,
    cwd,
    sendObjective
  });
}

export async function runMainMenu(context: CommandContext): Promise<void> {
  let view: ListView = "recent";

  for (;;) {
    const sessions = sortRecent(activeSessions(context.state));
    console.log("");
    console.log(`smux  View: ${view}`);
    console.log("");
    console.log(formatList(sessions, view));
    console.log("");
    console.log("Commands: number attach | n new | r recent | p path | k kind | s # status | m # send | x # kill | q quit");
    const input = await ask("smux");
    const [command, ...rest] = input.split(/\s+/).filter(Boolean);

    if (!command || command === "q") {
      return;
    }
    if (command === "r") {
      view = "recent";
      continue;
    }
    if (command === "p") {
      view = "path";
      continue;
    }
    if (command === "k") {
      view = "kind";
      continue;
    }
    if (command === "n") {
      await createSessionFlow(context);
      return;
    }

    try {
      if (/^\d+$/.test(command)) {
        await attachCommand(context, selectedSession(sessions, command).name);
        return;
      }

      const targetToken = rest[0];
      if (!targetToken) {
        throw new Error(`Command "${command}" requires a session number.`);
      }
      const target = selectedSession(sessions, targetToken);

      if (command === "s") {
        statusCommand(context, target.name);
        continue;
      }
      if (command === "m") {
        const message = await ask("Message");
        if (message && (await confirm(`Send to ${target.name}?`, false))) {
          sendCommandToSession(context, target.name, message, { allowShell: false });
        }
        continue;
      }
      if (command === "x") {
        if (await confirm(`Kill ${target.name}?`, false)) {
          killCommand(context, target.name);
        }
        continue;
      }

      console.error(`Unknown command "${command}".`);
    } catch (error) {
      console.error((error as Error).message);
    }
  }
}
