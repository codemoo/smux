import { stdout } from "node:process";

const colorEnabled =
  !process.env.NO_COLOR && (process.env.FORCE_COLOR !== undefined || stdout.isTTY === true);

const ascii = process.env.SMUX_ASCII === "1";

function code(open: number, close: number): (value: string) => string {
  return (value) => (colorEnabled ? `\u001b[${open}m${value}\u001b[${close}m` : value);
}

export const style = {
  bold: code(1, 22),
  dim: code(2, 22),
  cyan: code(36, 39),
  green: code(32, 39),
  yellow: code(33, 39),
  magenta: code(35, 39),
  blue: code(34, 39),
  red: code(31, 39),
  gray: code(90, 39),
  inverse: code(7, 27)
};

export function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

export function visibleLength(value: string): number {
  return stripAnsi(value).length;
}

export function truncate(value: string, width: number): string {
  const plain = stripAnsi(value);
  if (plain.length <= width) {
    return value;
  }
  if (width <= 1) {
    return plain.slice(0, width);
  }
  return `${plain.slice(0, width - 1)}…`;
}

export function padEndVisible(value: string, width: number): string {
  const clipped = truncate(value, width);
  const padding = Math.max(0, width - visibleLength(clipped));
  return `${clipped}${" ".repeat(padding)}`;
}

export function terminalWidth(): number {
  return Math.min(Math.max(stdout.columns ?? 100, 72), 140);
}

export function key(value: string): string {
  return style.inverse(` ${value} `);
}

export function pill(value: string, tone: "cyan" | "green" | "yellow" | "red" | "gray" = "gray"): string {
  const color = style[tone];
  return color(`[${value}]`);
}

export function field(label: string, value: string): string {
  return `${style.gray(`${label}:`)} ${value}`;
}

export function sectionTitle(value: string): string {
  return style.bold(value);
}

export function box(title: string, body: string[]): string {
  const width = Math.min(terminalWidth(), 100);
  const innerWidth = width - 4;
  const chars = ascii
    ? { tl: "+", tr: "+", bl: "+", br: "+", h: "-", v: "|" }
    : { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" };

  const titleText = ` ${title} `;
  const topRule = `${chars.tl}${titleText}${chars.h.repeat(Math.max(0, width - 2 - visibleLength(titleText)))}${chars.tr}`;
  const bottomRule = `${chars.bl}${chars.h.repeat(width - 2)}${chars.br}`;
  const rows = body.flatMap((line) => line.split("\n")).map((line) => {
    const clipped = truncate(line, innerWidth);
    return `${chars.v} ${padEndVisible(clipped, innerWidth)} ${chars.v}`;
  });

  return [topRule, ...rows, bottomRule].join("\n");
}
