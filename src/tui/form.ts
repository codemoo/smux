import { readdirSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";
import type { CommandContext } from "../commands/context.js";
import { formatNewSessionForm } from "../core/format.js";
import { activeSessions } from "../core/resolve.js";
import type { SessionKind } from "../core/types.js";
import { FullScreen, readInput } from "./screen.js";

export interface NewSessionFormResult {
  name: string;
  cwd: string;
  objective: string;
  kind: SessionKind;
  tags: string[];
  resume: boolean;
  sendObjective: boolean;
}

interface FormState {
  step: number;
  name: string;
  cwd: string;
  objective: string;
  kind: SessionKind;
  tags: string;
  resume: boolean;
  sendObjective: boolean;
}

const STEP_NAME = 0;
const STEP_CWD = 1;
const STEP_KIND = 2;
const STEP_RESUME = 3;
const STEP_OBJECTIVE = 4;
const STEP_TAGS = 5;
const STEP_SEND = 6;
const fieldCount = 7;
const kinds: SessionKind[] = ["codex", "claude", "shell"];

function currentValue(state: FormState): string {
  if (state.step === STEP_NAME) {
    return state.name;
  }
  if (state.step === STEP_CWD) {
    return state.cwd;
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
  if (state.step === STEP_CWD) {
    return { ...state, cwd: value };
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

interface CwdCompletion {
  completed: string;
  suffix: string;
}

function expandHome(value: string): string {
  if (value === "~") {
    return homedir();
  }
  if (value.startsWith("~/")) {
    return join(homedir(), value.slice(2));
  }
  return value;
}

function resolveCwd(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return process.cwd();
  }
  const expanded = expandHome(trimmed);
  return isAbsolute(expanded) ? resolve(expanded) : resolve(process.cwd(), expanded);
}

function childDirectories(parent: string, prefix: string): string[] {
  try {
    return readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => name !== "node_modules")
      .filter((name) => prefix.startsWith(".") || !name.startsWith("."))
      .filter((name) => name.startsWith(prefix))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function appendChild(value: string, child: string): string {
  const trimmed = value.trim();
  const base = trimmed || ".";
  return `${base.endsWith("/") ? base : `${base}/`}${child}/`;
}

function replaceLastSegment(value: string, match: string): string {
  const trimmed = value.trim();
  const index = trimmed.lastIndexOf("/");
  if (index === -1) {
    return `${match}/`;
  }
  return `${trimmed.slice(0, index + 1)}${match}/`;
}

function cwdCompletion(value: string): CwdCompletion | undefined {
  const trimmed = value.trim();
  const resolved = resolveCwd(trimmed);
  const exactChildren = childDirectories(resolved, "");
  if (exactChildren.length > 0) {
    const child = exactChildren[0]!;
    return {
      completed: appendChild(trimmed, child),
      suffix: `${trimmed.endsWith("/") ? "" : "/"}${child}/`
    };
  }

  const parent = dirname(resolved);
  const prefix = basename(resolved);
  const match = childDirectories(parent, prefix)[0];
  if (!match || match === prefix) {
    return undefined;
  }

  return {
    completed: replaceLastSegment(trimmed, match),
    suffix: `${match.slice(prefix.length)}/`
  };
}

function formResult(state: FormState): NewSessionFormResult {
  const cwd = resolveCwd(state.cwd);
  const objective = state.objective.trim();
  const resume = state.kind !== "shell" && state.resume;
  return {
    name: state.name.trim() || basename(cwd),
    cwd,
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
    cwd: process.cwd(),
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
      cwdSuggestion: state.step === STEP_CWD ? cwdCompletion(state.cwd)?.suffix : undefined,
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

    if (name === "tab") {
      if (state.step === STEP_CWD) {
        const completion = cwdCompletion(state.cwd);
        if (completion) {
          state = { ...state, cwd: completion.completed };
          continue;
        }
      }
      state = { ...state, step: Math.min(fieldCount - 1, state.step + 1) };
      continue;
    }
    if (name === "down") {
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
