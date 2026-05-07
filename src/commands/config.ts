import { configFilePath, effectiveTmuxOptions, parseConfigValue } from "../core/config.js";
import { applyTmuxOptions } from "../core/tmux.js";
import { resolveSession, tmuxTarget } from "../core/resolve.js";
import { upsertSession } from "../core/store.js";
import { formatConfig, formatSessionConfig } from "../core/format.js";
import type { CommandContext } from "./context.js";
import type { SmuxConfig, TmuxOptions } from "../core/types.js";

function setGlobalValue(config: SmuxConfig, key: string, value: string): SmuxConfig {
  const parsed = parseConfigValue(key, value);
  if (key === "fullscreen") {
    return { ...config, fullscreen: parsed as boolean };
  }
  if (key === "tmux.history-limit") {
    return { ...config, tmux: { ...config.tmux, historyLimit: parsed as number } };
  }
  if (key === "tmux.mouse") {
    return { ...config, tmux: { ...config.tmux, mouse: parsed as boolean } };
  }
  if (key === "tmux.mode-keys") {
    return { ...config, tmux: { ...config.tmux, modeKeys: parsed as "vi" | "emacs" } };
  }
  return config;
}

function setSessionValue(options: TmuxOptions, key: string, value: string): TmuxOptions {
  const parsed = parseConfigValue(key, value);
  if (key === "fullscreen") {
    throw new Error("fullscreen is a global smux setting, not a session setting.");
  }
  if (key === "tmux.history-limit") {
    return { ...options, historyLimit: parsed as number };
  }
  if (key === "tmux.mouse") {
    return { ...options, mouse: parsed as boolean };
  }
  if (key === "tmux.mode-keys") {
    return { ...options, modeKeys: parsed as "vi" | "emacs" };
  }
  return options;
}

export function showConfigCommand(context: CommandContext): void {
  console.log(formatConfig(context.config, configFilePath()));
}

export function setConfigCommand(context: CommandContext, key: string, value: string): void {
  const next = setGlobalValue(context.config, key, value);
  context.saveConfig(next);
  applyTmuxOptions(undefined, next.tmux);
  console.log(formatConfig(next, configFilePath()));
}

export function setSessionConfigCommand(
  context: CommandContext,
  query: string,
  key: string,
  value: string
): void {
  const session = resolveSession(context.state, query);
  const nextTmux = setSessionValue(session.tmux ?? {}, key, value);
  const now = new Date().toISOString();
  const updated = {
    ...session,
    tmux: nextTmux,
    updatedAt: now
  };
  const nextState = upsertSession(context.state, updated);
  context.save(nextState);
  applyTmuxOptions(tmuxTarget(updated), effectiveTmuxOptions(context.config, nextTmux));
  console.log(formatSessionConfig(updated, effectiveTmuxOptions(context.config, nextTmux)));
}

