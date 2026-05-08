import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { SmuxConfig, TmuxOptions } from "./types.js";

const CURRENT_VERSION = 1;

export function configFilePath(): string {
  return process.env.SMUX_CONFIG_FILE ?? join(homedir(), ".config", "smux", "config.json");
}

export function defaultConfig(): SmuxConfig {
  return {
    version: CURRENT_VERSION,
    fullscreen: true,
    tmux: {
      historyLimit: 200_000,
      mouse: true,
      modeKeys: "vi"
    }
  };
}

function booleanConfig(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function historyLimitConfig(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 2_000 ? value : fallback;
}

function modeKeysConfig(value: unknown, fallback: "vi" | "emacs"): "vi" | "emacs" {
  return value === "vi" || value === "emacs" ? value : fallback;
}

export function loadConfig(path = configFilePath()): SmuxConfig {
  const defaults = defaultConfig();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<SmuxConfig>;
    return {
      version: CURRENT_VERSION,
      fullscreen: booleanConfig(parsed.fullscreen, defaults.fullscreen),
      tmux: {
        historyLimit: historyLimitConfig(parsed.tmux?.historyLimit, defaults.tmux.historyLimit),
        mouse: booleanConfig(parsed.tmux?.mouse, defaults.tmux.mouse),
        modeKeys: modeKeysConfig(parsed.tmux?.modeKeys, defaults.tmux.modeKeys)
      }
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return defaults;
    }
    throw error;
  }
}

export function saveConfig(config: SmuxConfig, path = configFilePath()): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`);
  renameSync(tmp, path);
}

export function effectiveTmuxOptions(config: SmuxConfig, override?: TmuxOptions): Required<TmuxOptions> {
  return {
    historyLimit: override?.historyLimit ?? config.tmux.historyLimit,
    mouse: override?.mouse ?? config.tmux.mouse,
    modeKeys: override?.modeKeys ?? config.tmux.modeKeys
  };
}

export function parseConfigValue(key: string, value: string): string | number | boolean {
  if (key === "tmux.history-limit") {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 2_000) {
      throw new Error("tmux.history-limit must be an integer >= 2000.");
    }
    return parsed;
  }
  if (key === "tmux.mouse" || key === "fullscreen") {
    const normalized = value.toLowerCase();
    if (["on", "true", "1", "yes"].includes(normalized)) {
      return true;
    }
    if (["off", "false", "0", "no"].includes(normalized)) {
      return false;
    }
    throw new Error(`${key} must be on/off.`);
  }
  if (key === "tmux.mode-keys") {
    if (value !== "vi" && value !== "emacs") {
      throw new Error("tmux.mode-keys must be vi or emacs.");
    }
    return value;
  }
  throw new Error(`Unknown config key "${key}".`);
}
