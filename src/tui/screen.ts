import { stdin, stdout } from "node:process";

export class FullScreen {
  private active = false;

  constructor(private readonly enabled: boolean) {}

  start(): void {
    if (!this.enabled || !stdin.isTTY || !stdout.isTTY || this.active) {
      return;
    }
    this.active = true;
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
    stdout.write("\u001b[?1049l");
    this.active = false;
  }
}

