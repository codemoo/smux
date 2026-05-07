import { loadState, saveState } from "../core/store.js";
import { reconcile } from "../core/reconcile.js";
import { loadConfig, saveConfig } from "../core/config.js";
import type { SmuxConfig, SmuxState } from "../core/types.js";

export interface CommandContext {
  state: SmuxState;
  config: SmuxConfig;
  save(state: SmuxState): void;
  saveConfig(config: SmuxConfig): void;
}

export function loadContext(): CommandContext {
  const state = reconcile(loadState());
  const config = loadConfig();
  const context: CommandContext = {
    state,
    config,
    save(nextState) {
      context.state = nextState;
      saveState(nextState);
    },
    saveConfig(nextConfig) {
      context.config = nextConfig;
      saveConfig(nextConfig);
    }
  };
  return context;
}
