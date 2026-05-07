import { basename } from "node:path";
import { attachCommand } from "../commands/attach.js";
import { killCommand } from "../commands/kill.js";
import { newCommand } from "../commands/new.js";
import { sendCommandToSession } from "../commands/send.js";
import { activeSessions } from "../core/resolve.js";
import { formatDashboard, formatDashboardHelp, formatStatus, sortRecent } from "../core/format.js";
import type { CommandContext } from "../commands/context.js";
import type { ListView, SessionKind, SmuxSession } from "../core/types.js";
import { ask, confirm } from "./prompt.js";
import { FullScreen, readInput } from "./screen.js";
import { style } from "../core/theme.js";

function parseKind(value: string): SessionKind {
  if (value === "claude" || value === "codex" || value === "shell") {
    return value;
  }
  throw new Error(`Invalid kind "${value}". Use claude, codex, or shell.`);
}

function matchesFilter(session: SmuxSession, filter: string): boolean {
  if (!filter) {
    return true;
  }
  const haystack = [
    session.name,
    session.kind,
    session.agentStatus,
    session.cwd,
    session.objective,
    session.gitBranch,
    ...session.tags
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(filter.toLowerCase());
}

function visibleSessions(sessions: SmuxSession[], view: ListView, filter: string): SmuxSession[] {
  const scoped =
    view === "waiting"
      ? sessions.filter((session) => session.agentStatus === "waiting" || session.agentStatus === "blocked")
      : sessions;
  return sortRecent(scoped).filter((session) => matchesFilter(session, filter));
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

async function showOverlay(screen: FullScreen, render: () => string): Promise<void> {
  for (;;) {
    screen.draw(`${render()}\n\n${style.dim("Press any key to return")}`);
    const input = await readInput();
    if (input.type === "key") {
      return;
    }
  }
}

export async function runMainMenu(context: CommandContext): Promise<void> {
  let view: ListView = "recent";
  let filter = "";
  let selectedIndex = 0;
  let message: string | undefined;
  const screen = new FullScreen(context.config.fullscreen);
  screen.start();

  try {
    for (;;) {
      const allSessions = sortRecent(activeSessions(context.state));
      const sessions = visibleSessions(allSessions, view, filter);
      selectedIndex = Math.min(Math.max(selectedIndex, 0), Math.max(0, sessions.length - 1));
      const selected = sessions[selectedIndex];

      screen.draw(formatDashboard({
        view,
        sessions,
        allSessions,
        selected,
        filter,
        config: context.config,
        message
      }));
      message = undefined;

      const input = await readInput();
      if (input.type === "resize") {
        continue;
      }
      const key = input.key;
      const name = key.name;
      const sequence = key.sequence;

      if (key.ctrl && name === "c") {
        return;
      }
      if (name === "q" || sequence === "q") {
        return;
      }
      if (name === "up" || sequence === "k") {
        selectedIndex = Math.max(0, selectedIndex - 1);
        continue;
      }
      if (name === "down" || sequence === "j") {
        selectedIndex = Math.min(Math.max(0, sessions.length - 1), selectedIndex + 1);
        continue;
      }
      if (sequence === "g") {
        selectedIndex = 0;
        continue;
      }
      if (sequence === "G") {
        selectedIndex = Math.max(0, sessions.length - 1);
        continue;
      }
      if (name === "escape") {
        filter = "";
        continue;
      }
      if (sequence === "r") {
        view = "recent";
        selectedIndex = 0;
        continue;
      }
      if (sequence === "p") {
        view = "path";
        selectedIndex = 0;
        continue;
      }
      if (sequence === "a") {
        view = "kind";
        selectedIndex = 0;
        continue;
      }
      if (sequence === "w") {
        view = "waiting";
        selectedIndex = 0;
        continue;
      }
      if (sequence === "?") {
        await showOverlay(screen, formatDashboardHelp);
        continue;
      }
      if (sequence === "/") {
        screen.suspend();
        filter = await ask("Filter", filter);
        selectedIndex = 0;
        screen.resume();
        continue;
      }
      if (sequence === "n") {
        screen.stop();
        await createSessionFlow(context);
        return;
      }

      try {
        if (/^[1-9]$/.test(sequence ?? "")) {
          const quickIndex = Number(sequence) - 1;
          if (quickIndex < sessions.length) {
            selectedIndex = quickIndex;
          }
          continue;
        }

        if (name === "return" || name === "enter") {
          if (!selected) {
            message = "No session selected.";
            continue;
          }
          screen.stop();
          await attachCommand(context, selected.name);
          return;
        }

        const target = selected;
        if (!target) {
          message = "No session selected.";
          continue;
        }

        if (sequence === "s") {
          await showOverlay(screen, () => formatStatus(target));
          continue;
        }
        if (sequence === "m") {
          screen.suspend();
          const message = await ask("Message");
          if (message && (await confirm(`Send to ${target.name}?`, false))) {
            sendCommandToSession(context, target.name, message, { allowShell: false });
            await ask("Press Enter");
          }
          screen.resume();
          continue;
        }
        if (sequence === "x") {
          screen.suspend();
          if (await confirm(`Kill ${target.name}?`, false)) {
            killCommand(context, target.name);
            await ask("Press Enter");
          }
          screen.resume();
          continue;
        }

        message = `Unknown key ${sequence ?? name ?? ""}. Press ? for help.`;
      } catch (error) {
        screen.suspend();
        console.error(style.red((error as Error).message));
        await ask("Press Enter");
        screen.resume();
      }
    }
  } finally {
    screen.stop();
  }
}
