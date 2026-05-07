# smux

`smux` is a planned TypeScript CLI for managing local and remote `tmux` sessions that run `claude`, `codex`, or a plain shell.

The npm package name is `smux-ai`; the installed binary is `smux`.

The first implementation target is local-only:

- list existing local `tmux` sessions by recent use, path, or agent kind
- create a new session from the current directory
- choose session kind: `claude`, `codex`, or `shell`
- attach to an existing session
- keep session metadata in local state
- sync rename changes between `smux` and `tmux`
- track each agent session's objective, tags, git branch, and lightweight status
- inspect an agent session without attaching
- send a short confirmed message to an agent session from outside tmux

The first version is intentionally local-only. Remote tmux hosts come later.

## Name

`smux` is the command users type. `smux-ai` is the npm package name.

```sh
npx smux-ai
npm install -g smux-ai
smux
```

The project is focused on managing AI-agent terminal sessions on top of `tmux`: keeping track of where each agent is working, what kind of agent it is, what task it was started for, and how to return to it quickly.

## Development

```sh
npm install
npm run build
npm run smux -- list
```
