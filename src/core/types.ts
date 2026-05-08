export type SessionKind = "claude" | "codex" | "shell";

export type AgentStatus =
  | "idle"
  | "running"
  | "waiting"
  | "blocked"
  | "done"
  | "unknown";

export interface SmuxNote {
  text: string;
  createdAt: string;
}

export interface TmuxOptions {
  historyLimit?: number;
  mouse?: boolean;
  modeKeys?: "vi" | "emacs";
}

export interface SmuxConfig {
  version: 1;
  fullscreen: boolean;
  tmux: Required<TmuxOptions>;
}

export interface SmuxSession {
  id: string;
  name: string;
  kind: SessionKind;
  resume: boolean;
  agentStatus: AgentStatus;
  cwd: string;
  repoRoot?: string;
  gitBranch?: string;
  gitDirty?: boolean;
  tmuxSessionId?: string;
  tmuxSessionName: string;
  tmux?: TmuxOptions;
  status: "attached" | "detached" | "missing" | "terminated";
  lastPreview?: string;
  notes: SmuxNote[];
  createdAt: string;
  updatedAt: string;
  lastAttachedAt?: string;
}

export interface SmuxState {
  version: 1;
  sessions: SmuxSession[];
}

export interface TmuxSession {
  id: string;
  name: string;
  attached: boolean;
  createdAtEpoch: number;
  lastAttachedAtEpoch?: number;
}

export interface GitInfo {
  repoRoot?: string;
  branch?: string;
  dirty?: boolean;
}

export type ListView = "recent" | "path" | "kind" | "waiting";
