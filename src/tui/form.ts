import { basename } from "node:path";
import type { CommandContext } from "../commands/context.js";
import { formatNewSessionForm } from "../core/format.js";
import { activeSessions } from "../core/resolve.js";
import type { SessionKind } from "../core/types.js";
import { FullScreen, readInput } from "./screen.js";

export interface NewSessionFormResult {
  name: string;
  objective: string;
  kind: SessionKind;
  tags: string[];
  resume: boolean;
  sendObjective: boolean;
}

interface FormState {
  step: number;
  name: string;
  objective: string;
  kind: SessionKind;
  tags: string;
  resume: boolean;
  sendObjective: boolean;
}

const STEP_NAME = 0;
const STEP_KIND = 1;
const STEP_RESUME = 2;
const STEP_OBJECTIVE = 3;
const STEP_TAGS = 4;
const STEP_SEND = 5;
const fieldCount = 6;
const kinds: SessionKind[] = ["codex", "claude", "shell"];

function currentValue(state: FormState): string {
  if (state.step === STEP_NAME) {
    return state.name;
  }
  if (state.step === STEP_OBJECTIVE) {
    return state.objective;
  }
  if (state.step === STEP_TAGS) {
    return state.tags;
  }
  return "";
}

function updateCurrentValue(state: FormState, value: string): FormState {
  if (state.step === STEP_NAME) {
    return { ...state, name: value };
  }
  if (state.step === STEP_OBJECTIVE) {
    return { ...state, objective: value };
  }
  if (state.step === STEP_TAGS) {
    return { ...state, tags: value };
  }
  return state;
}

function nextKind(kind: SessionKind, delta: number): SessionKind {
  const index = kinds.indexOf(kind);
  return kinds[(index + delta + kinds.length) % kinds.length]!;
}

function updateKind(state: FormState, kind: SessionKind): FormState {
  return {
    ...state,
    kind,
    resume: kind === "shell" ? false : state.resume
  };
}

function formResult(state: FormState): NewSessionFormResult {
  const objective = state.objective.trim();
  const resume = state.kind !== "shell" && state.resume;
  return {
    name: state.name.trim() || basename(process.cwd()),
    objective,
    kind: state.kind,
    tags: state.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    resume,
    sendObjective: state.kind !== "shell" && !resume && objective.length > 0 && state.sendObjective
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
    resume: false,
    sendObjective: true
  };

  for (;;) {
    screen.draw(formatNewSessionForm({
      state,
      cwd: process.cwd(),
      activeCount: activeSessions(context.state).length,
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

    if (state.step === STEP_KIND) {
      if (name === "left") {
        state = updateKind(state, nextKind(state.kind, -1));
        continue;
      }
      if (name === "right") {
        state = updateKind(state, nextKind(state.kind, 1));
        continue;
      }
      if (sequence === "c") {
        state = updateKind(state, "codex");
        continue;
      }
      if (sequence === "l") {
        state = updateKind(state, "claude");
        continue;
      }
      if (sequence === "s") {
        state = updateKind(state, "shell");
        continue;
      }
    }

    if (state.step === STEP_RESUME) {
      if (state.kind !== "shell" && (sequence === " " || sequence === "y" || sequence === "n")) {
        state = { ...state, resume: sequence === " " ? !state.resume : sequence === "y" };
      }
      continue;
    }

    if (state.step === STEP_SEND) {
      const canSendObjective = state.kind !== "shell" && !state.resume && state.objective.trim().length > 0;
      if (sequence === " " || sequence === "y" || sequence === "n") {
        state = {
          ...state,
          sendObjective: canSendObjective && (sequence === " " ? !state.sendObjective : sequence === "y")
        };
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
