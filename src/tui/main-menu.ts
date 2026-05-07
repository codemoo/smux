import { attachCommand } from "../commands/attach.js";
import { killCommand } from "../commands/kill.js";
import { newCommand } from "../commands/new.js";
import { activeSessions, tmuxTarget } from "../core/resolve.js";
import { formatDashboard, formatDashboardHelp, formatStatus, sortRecent } from "../core/format.js";
import type { CommandContext } from "../commands/context.js";
import type { ListView, SmuxSession } from "../core/types.js";
import { ask, confirm } from "./prompt.js";
import { FullScreen, readInput } from "./screen.js";
import { fillLine, style, terminalWidth } from "../core/theme.js";
import { runNewSessionForm } from "./form.js";
import { reconcile } from "../core/reconcile.js";
import { pasteMessage, renameTmuxSession } from "../core/tmux.js";
import { upsertSession } from "../core/store.js";
import { tokenUsageForSession, type TokenUsageSummary } from "../core/token-usage.js";
import type { DashboardFocusItem, DashboardPane } from "../core/format.js";

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

function printableSequence(key: { sequence?: string; ctrl?: boolean; meta?: boolean }): string | undefined {
  if (key.ctrl || key.meta) {
    return undefined;
  }
  const sequence = key.sequence ?? "";
  return sequence.length === 1 && sequence >= " " ? sequence : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export async function runMainMenu(context: CommandContext): Promise<void> {
  let view: ListView = "recent";
  let filter = "";
  let selectedIndex = 0;
  let message: string | undefined;
  let pane: DashboardPane = "list";
  const focusItems: DashboardFocusItem[] = ["name", "preview", "message"];
  let focusIndex = 0;
  let renameDraft = "";
  let messageDraft = "";
  let previewScroll = 0;
  let selectedId: string | undefined;
  let tokenUsage: TokenUsageSummary | undefined;
  let tokenUsageSessionId: string | undefined;
  let tokenUsageAt = 0;
  const screen = new FullScreen(context.config.fullscreen);
  screen.start();

  try {
    for (;;) {
      context.state = reconcile(context.state);
      const allSessions = sortRecent(activeSessions(context.state));
      const sessions = visibleSessions(allSessions, view, filter);
      selectedIndex = Math.min(Math.max(selectedIndex, 0), Math.max(0, sessions.length - 1));
      const selected = sessions[selectedIndex];
      if (selected?.id !== selectedId) {
        selectedId = selected?.id;
        renameDraft = selected?.name ?? "";
        messageDraft = "";
        previewScroll = 0;
        tokenUsage = undefined;
        tokenUsageSessionId = undefined;
        tokenUsageAt = 0;
      }

      const now = Date.now();
      if (!selected || selected.kind === "shell") {
        tokenUsage = undefined;
        tokenUsageSessionId = selected?.id;
        tokenUsageAt = now;
      } else if (tokenUsageSessionId !== selected.id || now - tokenUsageAt > 15_000) {
        tokenUsage = tokenUsageForSession(selected);
        tokenUsageSessionId = selected.id;
        tokenUsageAt = now;
      }

      screen.draw(formatDashboard({
        view,
        sessions,
        allSessions,
        selected,
        filter,
        config: context.config,
        message,
        pane,
        focusItem: focusItems[focusIndex]!,
        renameDraft,
        messageDraft,
        previewScroll,
        tokenUsage
      }));
      message = undefined;

      const input = await readInput(1_000);
      if (input.type === "resize") {
        continue;
      }
      if (input.type === "timeout") {
        continue;
      }
      const key = input.key;
      const name = key.name;
      const sequence = key.sequence;

      if (key.ctrl && name === "c") {
        return;
      }
      if (pane === "list" && (name === "q" || sequence === "q")) {
        return;
      }
      if (pane === "list" && name === "right" && selected) {
        pane = "focus";
        focusIndex = 0;
        renameDraft = selected.name;
        continue;
      }
      if (pane === "focus") {
        if (!selected) {
          pane = "list";
          continue;
        }
        if (name === "left" || name === "escape") {
          pane = "list";
          continue;
        }
        if (name === "tab") {
          focusIndex = (focusIndex + 1) % focusItems.length;
          continue;
        }
        if (name === "up") {
          focusIndex = clamp(focusIndex - 1, 0, focusItems.length - 1);
          continue;
        }
        if (name === "down") {
          focusIndex = clamp(focusIndex + 1, 0, focusItems.length - 1);
          continue;
        }

        const focusItem = focusItems[focusIndex]!;
        try {
          if (focusItem === "preview") {
            if (name === "pageup" || (key.ctrl && sequence === "u")) {
              previewScroll += 8;
              continue;
            }
            if (name === "pagedown" || (key.ctrl && sequence === "d")) {
              previewScroll = Math.max(0, previewScroll - 8);
              continue;
            }
            if (name === "return" || name === "enter") {
              await leaveForTmux(screen, async () => {
                await attachCommand(context, selected.name);
              });
              context.state = reconcile(context.state);
              message = "Detached. Back in smux.";
              continue;
            }
          }

          if (focusItem === "name") {
            if (name === "backspace" || name === "delete") {
              renameDraft = renameDraft.slice(0, -1);
              continue;
            }
            if (name === "return" || name === "enter") {
              const nextName = renameDraft.trim();
              if (!nextName) {
                message = "Session name cannot be empty.";
                continue;
              }
              if (nextName.includes(":")) {
                message = "tmux session names cannot contain ':'.";
                continue;
              }
              if (nextName !== selected.name) {
                renameTmuxSession(tmuxTarget(selected), nextName);
                const updated = {
                  ...selected,
                  name: nextName,
                  tmuxSessionName: nextName,
                  updatedAt: new Date().toISOString()
                };
                context.save(upsertSession(context.state, updated));
                message = `Renamed to ${nextName}.`;
              }
              continue;
            }
            const printable = printableSequence(key);
            if (printable) {
              renameDraft = `${renameDraft}${printable}`;
              continue;
            }
          }

          if (focusItem === "message") {
            if (selected.kind === "shell") {
              if (name === "return" || name === "enter") {
                message = "Shell sessions do not accept agent prompts.";
              }
              continue;
            }
            if (name === "backspace" || name === "delete") {
              messageDraft = messageDraft.slice(0, -1);
              continue;
            }
            if (name === "return" || name === "enter") {
              const prompt = messageDraft.trim();
              if (!prompt) {
                message = "Message is empty.";
                continue;
              }
              pasteMessage(tmuxTarget(selected), prompt);
              messageDraft = "";
              message = `Sent prompt to ${selected.name}.`;
              continue;
            }
            const printable = printableSequence(key);
            if (printable) {
              messageDraft = `${messageDraft}${printable}`;
              continue;
            }
          }

          message = `Unknown focus key ${sequence ?? name ?? ""}. Press ← to return.`;
        } catch (error) {
          screen.suspend();
          console.error(style.red((error as Error).message));
          await ask("Press Enter");
          screen.resume();
        }
        continue;
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
        const result = await runNewSessionForm(screen, context);
        if (!result) {
          message = "New session cancelled.";
          continue;
        }
        await leaveForTmux(screen, async () => {
          await newCommand(context, result);
        });
        context.state = reconcile(context.state);
        message = "Detached. Back in smux.";
        continue;
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
          await leaveForTmux(screen, async () => {
            await attachCommand(context, selected.name);
          });
          context.state = reconcile(context.state);
          message = "Detached. Back in smux.";
          continue;
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
