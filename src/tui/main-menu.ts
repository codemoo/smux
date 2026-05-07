import { basename } from "node:path";
import { attachCommand } from "../commands/attach.js";
import { killCommand } from "../commands/kill.js";
import { newCommand } from "../commands/new.js";
import { sendCommandToSession } from "../commands/send.js";
import { statusCommand } from "../commands/status.js";
import { activeSessions } from "../core/resolve.js";
import { formatList, formatShell, sortRecent } from "../core/format.js";
import type { CommandContext } from "../commands/context.js";
import type { ListView, SessionKind, SmuxSession } from "../core/types.js";
import { ask, confirm } from "./prompt.js";
import { FullScreen } from "./screen.js";
import { key, style } from "../core/theme.js";

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
  const screen = new FullScreen(context.config.fullscreen);
  screen.start();

  try {
    for (;;) {
      const sessions = sortRecent(activeSessions(context.state));
      screen.draw([
        formatShell(view, sessions),
        "",
        formatList(sessions, view),
        "",
        `${key("1-9")} attach  ${key("n")} new  ${key("r")} recent  ${key("p")} path  ${key("k")} kind`,
        `${key("s #")} status  ${key("m #")} send  ${key("x #")} kill  ${key("q")} quit`,
        "",
        style.dim("Tip: smux config set tmux.history-limit 200000")
      ].join("\n"));

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
        screen.stop();
        await createSessionFlow(context);
        return;
      }

      try {
        if (/^\d+$/.test(command)) {
          screen.stop();
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
          await ask("Press Enter");
          continue;
        }
        if (command === "m") {
          const message = await ask("Message");
          if (message && (await confirm(`Send to ${target.name}?`, false))) {
            sendCommandToSession(context, target.name, message, { allowShell: false });
            await ask("Press Enter");
          }
          continue;
        }
        if (command === "x") {
          if (await confirm(`Kill ${target.name}?`, false)) {
            killCommand(context, target.name);
            await ask("Press Enter");
          }
          continue;
        }

        console.error(`Unknown command "${command}".`);
        await ask("Press Enter");
      } catch (error) {
        console.error(style.red((error as Error).message));
        await ask("Press Enter");
      }
    }
  } finally {
    screen.stop();
  }
}
