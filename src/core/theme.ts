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
  white: code(37, 39),
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

export function terminalHeight(): number {
  return Math.min(Math.max(stdout.rows ?? 32, 20), 60);
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

export function fillLine(value: string, width = terminalWidth()): string {
  return padEndVisible(truncate(value, width), width);
}

export function boxLines(title: string, body: string[], width: number, height?: number): string[] {
  const safeWidth = Math.max(24, width);
  const innerWidth = safeWidth - 4;
  const chars = ascii
    ? { tl: "+", tr: "+", bl: "+", br: "+", h: "-", v: "|" }
    : { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" };

  const titleText = ` ${truncate(title, safeWidth - 6)} `;
  const topRule = `${chars.tl}${titleText}${chars.h.repeat(Math.max(0, safeWidth - 2 - visibleLength(titleText)))}${chars.tr}`;
  const bottomRule = `${chars.bl}${chars.h.repeat(safeWidth - 2)}${chars.br}`;
  const rawRows = body.flatMap((line) => line.split("\n"));
  const contentHeight = height ? Math.max(0, height - 2) : rawRows.length;
  const visibleRows = rawRows.slice(0, contentHeight);
  while (visibleRows.length < contentHeight) {
    visibleRows.push("");
  }

  const rows = visibleRows.map((line) => {
    const clipped = truncate(line, innerWidth);
    return `${chars.v} ${padEndVisible(clipped, innerWidth)} ${chars.v}`;
  });

  return [topRule, ...rows, bottomRule];
}

export function joinColumns(left: string[], right: string[], gap = 2): string[] {
  const leftWidth = Math.max(...left.map((line) => visibleLength(line)), 0);
  const height = Math.max(left.length, right.length);
  const rows: string[] = [];

  for (let index = 0; index < height; index += 1) {
    rows.push(`${padEndVisible(left[index] ?? "", leftWidth)}${" ".repeat(gap)}${right[index] ?? ""}`);
  }

  return rows;
}

export function box(title: string, body: string[]): string {
  return boxLines(title, body, Math.min(terminalWidth(), 100)).join("\n");
}
