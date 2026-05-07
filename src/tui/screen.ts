import { stdin, stdout } from "node:process";
import { emitKeypressEvents } from "node:readline";

export interface KeyInput {
  name?: string;
  sequence?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

export type ScreenInput =
  | {
      type: "key";
      key: KeyInput;
    }
  | {
      type: "resize";
    }
  | {
      type: "timeout";
    };

interface PendingInput {
  resolve(input: ScreenInput): void;
  timer?: NodeJS.Timeout;
}

const inputQueue: ScreenInput[] = [];
let inputCaptureActive = false;
let pendingInput: PendingInput | undefined;

function setRawMode(enabled: boolean): void {
  if (stdin.isTTY && typeof stdin.setRawMode === "function") {
    stdin.setRawMode(enabled);
  }
}

function settleInput(input: ScreenInput): void {
  if (!pendingInput) {
    inputQueue.push(input);
    return;
  }
  const pending = pendingInput;
  pendingInput = undefined;
  if (pending.timer) {
    clearTimeout(pending.timer);
  }
  pending.resolve(input);
}

const keypressHandler = (_value: string, key: KeyInput) => {
  settleInput({ type: "key", key });
};

const resizeHandler = () => {
  settleInput({ type: "resize" });
};

function startInputCapture(): void {
  if (inputCaptureActive) {
    return;
  }
  emitKeypressEvents(stdin);
  stdin.on("keypress", keypressHandler);
  stdout.on("resize", resizeHandler);
  inputCaptureActive = true;
}

function stopInputCapture(): void {
  if (!inputCaptureActive) {
    inputQueue.length = 0;
    return;
  }
  stdin.off("keypress", keypressHandler);
  stdout.off("resize", resizeHandler);
  inputCaptureActive = false;
  inputQueue.length = 0;
  if (pendingInput) {
    const pending = pendingInput;
    pendingInput = undefined;
    if (pending.timer) {
      clearTimeout(pending.timer);
    }
    pending.resolve({ type: "timeout" });
  }
}

export class FullScreen {
  private active = false;
  private frame: string | undefined;

  constructor(private readonly enabled: boolean) {}

  start(): void {
    if (!this.enabled || !stdin.isTTY || !stdout.isTTY || this.active) {
      return;
    }
    this.active = true;
    this.frame = undefined;
    setRawMode(true);
    startInputCapture();
    stdin.resume();
    stdout.write("\u001b[?1049h\u001b[?25l\u001b[2J\u001b[H");
  }

  draw(content: string): void {
    if (!this.active) {
      console.log(content);
      return;
    }
    if (content === this.frame) {
      return;
    }
    const rows = content
      .split("\n")
      .map((line) => `\u001b[2K${line}`)
      .join("\n");
    stdout.write(`\u001b[H${rows}\u001b[J`);
    this.frame = content;
  }

  stop(): void {
    if (!this.active) {
      return;
    }
    setRawMode(false);
    stopInputCapture();
    stdin.pause();
    stdout.write("\u001b[?25h\u001b[?1049l");
    this.frame = undefined;
    this.active = false;
  }

  suspend(): void {
    this.frame = undefined;
    stdout.write("\u001b[?25h");
    stopInputCapture();
    setRawMode(false);
  }

  resume(): void {
    if (this.active) {
      this.frame = undefined;
      setRawMode(true);
      startInputCapture();
      stdin.resume();
      stdout.write("\u001b[?25l");
    }
  }
}

export function readInput(timeoutMs?: number): Promise<ScreenInput> {
  startInputCapture();
  setRawMode(true);
  stdin.resume();

  return new Promise((resolve) => {
    const queued = inputQueue.shift();
    if (queued) {
      resolve(queued);
      return;
    }
    const pending: PendingInput = { resolve };
    if (timeoutMs) {
      pending.timer = setTimeout(() => {
        if (pendingInput === pending) {
          pendingInput = undefined;
          resolve({ type: "timeout" });
        }
      }, timeoutMs);
    }
    pendingInput = pending;
  });
}

export async function readKey(): Promise<KeyInput> {
  for (;;) {
    const input = await readInput();
    if (input.type === "key") {
      return input.key;
    }
  }
}
