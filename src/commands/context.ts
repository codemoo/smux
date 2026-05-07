import { loadState, saveState } from "../core/store.js";
import { reconcile } from "../core/reconcile.js";
import type { SmuxState } from "../core/types.js";

export interface CommandContext {
  state: SmuxState;
  save(state: SmuxState): void;
}

export function loadContext(): CommandContext {
  const state = reconcile(loadState());
  const context: CommandContext = {
    state,
    save(nextState) {
      context.state = nextState;
      saveState(nextState);
    }
  };
  return context;
}
