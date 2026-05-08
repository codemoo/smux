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

function sameState(left: SmuxState, right: SmuxState): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function refreshContextState(context: CommandContext): void {
  const nextState = reconcile(context.state);
  if (sameState(context.state, nextState)) {
    context.state = nextState;
    return;
  }
  context.save(nextState);
}

export function loadContext(): CommandContext {
  const loadedState = loadState();
  const state = reconcile(loadedState);
  if (!sameState(loadedState, state)) {
    saveState(state);
  }
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
