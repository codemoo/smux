# smux

`smux` is a planned TypeScript CLI for managing local and remote `tmux` sessions that run `claude`, `codex`, or a plain shell.

The npm package name is `smux-ai`; the installed binary is `smux`.

The first implementation target is local-only:

- list existing local `tmux` sessions by recent use, path, or agent kind
- use a full-screen two-pane terminal dashboard by default
- use the full current terminal width and height, with responsive redraw on resize
- navigate with direct keys: `j/k`, arrow keys, `/`, `?`, `enter`
- create a new session from the current directory
- edit the launch directory during creation, with child-folder completion
- choose session kind: `claude`, `codex`, or `shell`
- start agent sessions fresh or through their resume pickers
- attach to an existing session
- keep session metadata in local state
- sync rename changes between `smux` and `tmux`
- track each agent session's objective, tags, git branch, and lightweight status
- inspect an agent session without attaching
- send a short confirmed message to an agent session from outside tmux
- set tmux scrollback/mouse defaults globally or per session

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

Resume an agent session picker when creating a new tmux session:

```sh
smux new --kind codex --resume
smux new --kind claude --resume
smux new --kind codex --cwd ./packages/api
```

`codex` starts with `codex resume`; `claude` starts with `claude -r`. In the full-screen dashboard, press `n` and toggle `resume previous` in the new session form.
The new session form defaults `cwd` to the current directory. Move to the `cwd` field and press `Tab` to accept the dimmed child-folder completion.

Useful settings:

```sh
smux config
smux config set tmux.history-limit 200000
smux config set tmux.mouse on
smux config set fullscreen on
smux set my-session tmux.history-limit 300000
```

Dashboard keys:

```text
j/k or arrows  move selection
enter          attach selected session
n              new session
/              filter sessions
?              key help
r/p/a/w        recent/path/agent/waiting views
s              status panel
m              send message
x              kill session
q              quit
```

The dashboard uses a statusline, view tabs, a selectable session panel, and a detail panel for the currently selected session. It expands to the current terminal size and redraws when the terminal is resized. This is the primary interface; subcommands remain available for scripting.
