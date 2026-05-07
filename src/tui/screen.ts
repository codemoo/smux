import { stdin, stdout } from "node:process";
import { emitKeypressEvents } from "node:readline";

export interface KeyInput {
  name?: string;
  sequence?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

function setRawMode(enabled: boolean): void {
  if (stdin.isTTY && typeof stdin.setRawMode === "function") {
    stdin.setRawMode(enabled);
  }
}

export class FullScreen {
  private active = false;

  constructor(private readonly enabled: boolean) {}

  start(): void {
    if (!this.enabled || !stdin.isTTY || !stdout.isTTY || this.active) {
      return;
    }
    this.active = true;
    setRawMode(true);
    stdin.resume();
    stdout.write("\u001b[?1049h\u001b[2J\u001b[H");
  }

  draw(content: string): void {
    if (!this.active) {
      console.log(content);
      return;
    }
    stdout.write(`\u001b[2J\u001b[H${content}\n`);
  }

  stop(): void {
    if (!this.active) {
      return;
    }
    setRawMode(false);
    stdin.pause();
    stdout.write("\u001b[?1049l");
    this.active = false;
  }

  suspend(): void {
    setRawMode(false);
  }

  resume(): void {
    if (this.active) {
      setRawMode(true);
      stdin.resume();
    }
  }
}

export function readKey(): Promise<KeyInput> {
  emitKeypressEvents(stdin);
  setRawMode(true);
  stdin.resume();

  return new Promise((resolve) => {
    const handler = (_value: string, key: KeyInput) => {
      stdin.off("keypress", handler);
      resolve(key);
    };
    stdin.on("keypress", handler);
  });
}
