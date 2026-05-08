import { attachCommand } from "../commands/attach.js";
import { killCommand } from "../commands/kill.js";
import { newCommand } from "../commands/new.js";
import { activeSessions } from "../core/resolve.js";
import { formatDashboard, formatDashboardHelp, formatStatus, sortRecent } from "../core/format.js";
import { refreshContextState, type CommandContext } from "../commands/context.js";
import type { ListView, SmuxSession } from "../core/types.js";
import { FullScreen, readInput } from "./screen.js";
import { fillLine, style, terminalWidth } from "../core/theme.js";
import { runNewSessionForm } from "./form.js";

function matchesFilter(session: SmuxSession, filter: string): boolean {
  if (!filter) {
    return true;
  }
  const haystack = [
    session.name,
    session.kind,
    session.agentStatus,
    session.cwd,
    session.gitBranch
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

async function showOverlay(screen: FullScreen, render: () => string): Promise<void> {
  for (;;) {
    const footer = style.inverse(fillLine(" any key return   resize redraws", terminalWidth()));
    screen.draw(`${render()}\n${footer}`);
    const input = await readInput();
    if (input.type === "key") {
      return;
    }
  }
}

async function leaveForTmux(screen: FullScreen, action: () => Promise<void>): Promise<void> {
  screen.stop();
  try {
    await action();
  } finally {
    screen.start();
  }
}

const REFRESH_MS = 1_000;
const INPUT_IDLE_REFRESH_PAUSE_MS = 3_000;

function refreshTimeout(lastKeyAt: number): number {
  const idleFor = Date.now() - lastKeyAt;
  if (idleFor < INPUT_IDLE_REFRESH_PAUSE_MS) {
    return INPUT_IDLE_REFRESH_PAUSE_MS - idleFor;
  }
  return REFRESH_MS;
}

export async function runMainMenu(context: CommandContext): Promise<void> {
  let view: ListView = "recent";
  let filter = "";
  let selectedIndex = 0;
  let message: string | undefined;
  let filterMode = false;
  let pendingKillName: string | undefined;
  let lastKeyAt = 0;
  const screen = new FullScreen(context.config.fullscreen);
  screen.start();

  try {
    for (;;) {
      refreshContextState(context);
      const allSessions = sortRecent(activeSessions(context.state));
      const sessions = visibleSessions(allSessions, view, filter);
      selectedIndex = Math.min(Math.max(selectedIndex, 0), Math.max(0, sessions.length - 1));
      const selected = sessions[selectedIndex];
      const notice = filterMode
        ? `Filter /${filter}  Enter accept, Esc clear`
        : pendingKillName
          ? `Press x again to kill ${pendingKillName}; Esc cancels.`
          : message;

      screen.draw(formatDashboard({
        view,
        sessions,
        allSessions,
        selected,
        filter,
        config: context.config,
        message: notice
      }));
      message = undefined;

      const input = await readInput(refreshTimeout(lastKeyAt));
      if (input.type !== "key") {
        continue;
      }
      lastKeyAt = Date.now();
      const key = input.key;
      const name = key.name;
      const sequence = key.sequence;

      if (filterMode) {
        pendingKillName = undefined;
        if (key.ctrl && name === "c") {
          return;
        }
        if (name === "return" || name === "enter") {
          filterMode = false;
          selectedIndex = 0;
          continue;
        }
        if (name === "escape") {
          filter = "";
          filterMode = false;
          selectedIndex = 0;
          continue;
        }
        if (name === "backspace" || name === "delete") {
          filter = filter.slice(0, -1);
          selectedIndex = 0;
          continue;
        }
        if (sequence && sequence.length === 1 && sequence >= " ") {
          filter += sequence;
          selectedIndex = 0;
        }
        continue;
      }

      if (key.ctrl && name === "c") {
        return;
      }
      if (name === "q" || sequence === "q") {
        return;
      }
      if (name === "escape") {
        filter = "";
        pendingKillName = undefined;
        continue;
      }
      if (name === "up" || sequence === "k") {
        pendingKillName = undefined;
        selectedIndex = Math.max(0, selectedIndex - 1);
        continue;
      }
      if (name === "down" || sequence === "j") {
        pendingKillName = undefined;
        selectedIndex = Math.min(Math.max(0, sessions.length - 1), selectedIndex + 1);
        continue;
      }
      if (sequence === "g") {
        pendingKillName = undefined;
        selectedIndex = 0;
        continue;
      }
      if (sequence === "G") {
        pendingKillName = undefined;
        selectedIndex = Math.max(0, sessions.length - 1);
        continue;
      }
      if (sequence === "r") {
        pendingKillName = undefined;
        view = "recent";
        selectedIndex = 0;
        continue;
      }
      if (sequence === "p") {
        pendingKillName = undefined;
        view = "path";
        selectedIndex = 0;
        continue;
      }
      if (sequence === "a") {
        pendingKillName = undefined;
        view = "kind";
        selectedIndex = 0;
        continue;
      }
      if (sequence === "w") {
        pendingKillName = undefined;
        view = "waiting";
        selectedIndex = 0;
        continue;
      }
      if (sequence === "?") {
        pendingKillName = undefined;
        await showOverlay(screen, formatDashboardHelp);
        continue;
      }
      if (sequence === "/") {
        pendingKillName = undefined;
        filterMode = true;
        continue;
      }
      if (sequence === "n") {
        pendingKillName = undefined;
        const result = await runNewSessionForm(screen, context);
        if (!result) {
          message = "New session cancelled.";
          continue;
        }
        try {
          await leaveForTmux(screen, async () => {
            await newCommand(context, result);
          });
          refreshContextState(context);
          message = "Detached. Back in smux.";
        } catch (error) {
          message = (error as Error).message;
        }
        continue;
      }

      try {
        if (/^[1-9]$/.test(sequence ?? "")) {
          const quickIndex = Number(sequence) - 1;
          if (quickIndex < sessions.length) {
            pendingKillName = undefined;
            selectedIndex = quickIndex;
          }
          continue;
        }

        if (name === "return" || name === "enter") {
          if (!selected) {
            message = "No session selected.";
            continue;
          }
          pendingKillName = undefined;
          await leaveForTmux(screen, async () => {
            await attachCommand(context, selected.name);
          });
          refreshContextState(context);
          message = "Detached. Back in smux.";
          continue;
        }

        const target = selected;
        if (!target) {
          message = "No session selected.";
          continue;
        }

        if (sequence === "s") {
          pendingKillName = undefined;
          await showOverlay(screen, () => formatStatus(target));
          continue;
        }
        if (sequence === "x") {
          if (pendingKillName === target.name) {
            killCommand(context, target.name, { quiet: true });
            refreshContextState(context);
            message = `Killed ${target.name}.`;
            pendingKillName = undefined;
          } else {
            pendingKillName = target.name;
          }
          continue;
        }

        pendingKillName = undefined;
        message = `Unknown key ${sequence ?? name ?? ""}. Press ? for help.`;
      } catch (error) {
        message = style.red((error as Error).message);
      }
    }
  } finally {
    screen.stop();
  }
}
