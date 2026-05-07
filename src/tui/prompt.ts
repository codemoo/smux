import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { style } from "../core/theme.js";

function disableRawMode(): void {
  if (input.isTTY && typeof input.setRawMode === "function") {
    input.setRawMode(false);
  }
}

export async function ask(question: string, defaultValue?: string): Promise<string> {
  disableRawMode();
  const rl = createInterface({ input, output });
  try {
    const suffix = defaultValue ? ` (${defaultValue})` : "";
    const answer = await rl.question(`${style.cyan("?")} ${style.bold(question)}${style.dim(suffix)}: `);
    return answer.trim() || defaultValue || "";
  } finally {
    rl.close();
  }
}

export async function confirm(question: string, defaultYes = false): Promise<boolean> {
  const suffix = defaultYes ? "Y/n" : "y/N";
  const answer = (await ask(`${question} [${suffix}]`)).toLowerCase();
  if (!answer) {
    return defaultYes;
  }
  return answer === "y" || answer === "yes";
}
