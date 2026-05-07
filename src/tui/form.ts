import { basename } from "node:path";
import type { CommandContext } from "../commands/context.js";
import { formatNewSessionForm } from "../core/format.js";
import type { SessionKind } from "../core/types.js";
import { FullScreen, readInput } from "./screen.js";

export interface NewSessionFormResult {
  name: string;
  objective: string;
  kind: SessionKind;
  tags: string[];
  sendObjective: boolean;
}

interface FormState {
  step: number;
  name: string;
  objective: string;
  kind: SessionKind;
  tags: string;
  sendObjective: boolean;
}

const fieldCount = 5;
const kinds: SessionKind[] = ["codex", "claude", "shell"];

function currentValue(state: FormState): string {
  if (state.step === 0) {
    return state.name;
  }
  if (state.step === 1) {
    return state.objective;
  }
  if (state.step === 3) {
    return state.tags;
  }
  return "";
}

function updateCurrentValue(state: FormState, value: string): FormState {
  if (state.step === 0) {
    return { ...state, name: value };
  }
  if (state.step === 1) {
    return { ...state, objective: value };
  }
  if (state.step === 3) {
    return { ...state, tags: value };
  }
  return state;
}

function nextKind(kind: SessionKind, delta: number): SessionKind {
  const index = kinds.indexOf(kind);
  return kinds[(index + delta + kinds.length) % kinds.length]!;
}

function formResult(state: FormState): NewSessionFormResult {
  return {
    name: state.name.trim() || basename(process.cwd()),
    objective: state.objective.trim(),
    kind: state.kind,
    tags: state.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    sendObjective: state.kind !== "shell" && state.objective.trim().length > 0 && state.sendObjective
  };
}

export async function runNewSessionForm(
  screen: FullScreen,
  context: CommandContext
): Promise<NewSessionFormResult | undefined> {
  let state: FormState = {
    step: 0,
    name: basename(process.cwd()),
    objective: "",
    kind: "codex",
    tags: "",
    sendObjective: true
  };

  for (;;) {
    screen.draw(formatNewSessionForm({
      state,
      cwd: process.cwd(),
      config: context.config
    }));

    const input = await readInput();
    if (input.type === "resize") {
      continue;
    }

    const key = input.key;
    const name = key.name;
    const sequence = key.sequence ?? "";

    if ((key.ctrl && name === "c") || name === "escape") {
      return undefined;
    }

    if (name === "tab" || name === "down") {
      state = { ...state, step: Math.min(fieldCount - 1, state.step + 1) };
      continue;
    }
    if (name === "up") {
      state = { ...state, step: Math.max(0, state.step - 1) };
      continue;
    }

    if (name === "return" || name === "enter") {
      if (state.step < fieldCount - 1) {
        state = { ...state, step: state.step + 1 };
        continue;
      }
      return formResult(state);
    }

    if (state.step === 2) {
      if (name === "left") {
        state = { ...state, kind: nextKind(state.kind, -1) };
        continue;
      }
      if (name === "right") {
        state = { ...state, kind: nextKind(state.kind, 1) };
        continue;
      }
      if (sequence === "c") {
        state = { ...state, kind: "codex" };
        continue;
      }
      if (sequence === "l") {
        state = { ...state, kind: "claude" };
        continue;
      }
      if (sequence === "s") {
        state = { ...state, kind: "shell" };
        continue;
      }
    }

    if (state.step === 4) {
      if (sequence === " " || sequence === "y" || sequence === "n") {
        state = { ...state, sendObjective: sequence === "n" ? false : !state.sendObjective };
      }
      continue;
    }

    if (name === "backspace" || name === "delete") {
      const value = currentValue(state);
      state = updateCurrentValue(state, value.slice(0, -1));
      continue;
    }

    if (sequence.length === 1 && sequence >= " ") {
      const value = currentValue(state);
      state = updateCurrentValue(state, `${value}${sequence}`);
    }
  }
}

