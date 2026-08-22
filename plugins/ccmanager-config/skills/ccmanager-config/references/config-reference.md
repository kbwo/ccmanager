# CCManager configuration reference

Applies to both `.ccmanager.json` (git repository root) and
`~/.config/ccmanager/config.json` — they accept the same keys.

Written against **CCManager v4.2.3**. The authoritative definition is
`ConfigurationData` / `ProjectConfigurationData` in
[`src/types/index.ts`](https://github.com/kbwo/ccmanager/blob/main/src/types/index.ts);
this document and `../schema/ccmanager.schema.json` follow it. If a key here
disagrees with that file, that file wins.

Top-level keys — all optional:

| Key | Purpose |
| --- | --- |
| [`commandPresets`](#commandpresets) | which CLI(s) a session can start |
| [`statusHooks`](#statushooks) | run a command when a session becomes idle/busy/waiting |
| [`worktreeHooks`](#worktreehooks) | run a command before/after a worktree is created |
| [`worktree`](#worktree) | worktree creation and list behaviour |
| [`mergeConfig`](#mergeconfig) | arguments for the merge/rebase action |
| [`shortcuts`](#shortcuts) | key bindings inside a session |
| [`autoApproval`](#autoapproval) | experimental automatic answering of prompts |

## How the two files combine

For every top-level key the project file defines, its **fields** override the
global file's fields; fields it omits keep the global value. The merge stops
there — a nested array or object that a field holds is taken as a whole, never
merged element by element (`ConfigReader` in
`src/services/config/configReader.ts` does `{...global, ...project}` per key).

Consequences worth planning around:

- `commandPresets.presets` in the project file **replaces** the global preset
  list. Repeat every preset the repository needs.
- `commandPresets.defaultPresetId` is a separate field: if the project file
  omits it, the *global* value is used, which usually points at a preset that no
  longer exists — CCManager then falls back to the first preset in the list.
- `shortcuts.returnToMenu` is replaced as a whole object, so give it every field
  (`key` and `ctrl`), not just the one you are changing.

---

## `commandPresets`

```json
{
  "commandPresets": {
    "presets": [
      {
        "id": "1",
        "name": "Claude",
        "command": "claude",
        "args": ["--model", "opus"],
        "fallbackArgs": [],
        "detectionStrategy": "claude"
      }
    ],
    "defaultPresetId": "1",
    "selectPresetOnStart": false
  }
}
```

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `presets` | array, required | one preset running `claude` | The list offered when starting a session. |
| `defaultPresetId` | string, required | `"1"` | `id` of the preset used when no choice is made. No match → first preset in the list. |
| `selectPresetOnStart` | boolean | `false` | Show the picker before every new session instead of using the default. |

Per preset:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string, required | Unique within `presets`. Any string; the UI generates `"1"`, `"2"`, … |
| `name` | string, required | Label in the picker. |
| `command` | string, required | Executable, resolved on `PATH`. |
| `args` | string[] | argv entries, **one token per element**. `["--model", "opus"]`. |
| `fallbackArgs` | string[] | Tried once if the session fails to start with `args`. Keep it minimal — `[]` retries the bare command. |
| `detectionStrategy` | enum | How session state is read from the terminal. Defaults to `"claude"`. |

### `detectionStrategy` per CLI

Set this whenever `command` is not `claude`, otherwise the session status
(idle / busy / waiting for input) — and therefore `statusHooks` and
auto-approval — is read with the wrong patterns and will be wrong.

| CLI | `command` | `detectionStrategy` |
| --- | --- | --- |
| Claude Code | `claude` | `claude` (default) |
| Gemini CLI | `gemini` | `gemini` |
| Codex CLI | `codex` | `codex` |
| Cursor Agent | `cursor-agent` | `cursor` |
| GitHub Copilot CLI | `copilot` | `github-copilot` |
| Cline CLI | `cline` | `cline` |
| OpenCode | `opencode` | `opencode` |
| Kimi CLI | `kimi` | `kimi` |

A wrapper script around one of these takes the strategy of the CLI it wraps.

### Claude Code teammate mode

For `command: "claude"` with the `claude` strategy, CCManager appends
`--teammate-mode in-process` itself, to keep Claude Code's agent teams from
fighting its PTY session management. Only set `--teammate-mode` in `args` if you
deliberately want a different value; yours wins.

---

## `statusHooks`

```json
{
  "statusHooks": {
    "waiting_input": {
      "command": "notify-send 'Claude' \"waiting in $CCMANAGER_WORKTREE_BRANCH\"",
      "enabled": true
    }
  }
}
```

Keys: `idle`, `busy`, `waiting_input`, `pending_auto_approval`. Each takes
`{"command": string, "enabled": boolean}` — **both required**, and `enabled`
must be `true` or the hook is skipped.

The command runs through the shell, in the worktree directory, with:

| Variable | Value |
| --- | --- |
| `CCMANAGER_OLD_STATE` | previous state |
| `CCMANAGER_NEW_STATE` | new state |
| `CCMANAGER_WORKTREE_PATH` | absolute path of the worktree |
| `CCMANAGER_WORKTREE_DIR` | its basename |
| `CCMANAGER_WORKTREE_BRANCH` | its branch |
| `CCMANAGER_SESSION_ID` | session identifier |

Keep hooks fast and non-interactive: they fire on every state transition of
every session.

---

## `worktreeHooks`

```json
{
  "worktreeHooks": {
    "post_creation": {"command": "bun install", "enabled": true}
  }
}
```

| Hook | Runs | Working directory | On failure |
| --- | --- | --- | --- |
| `pre_creation` | before the worktree is created | git root (the worktree does not exist yet) | **non-zero exit aborts creation** — use it for validation |
| `post_creation` | after creation succeeded | the new worktree | logged, worktree is kept |

Same `{"command", "enabled"}` shape as status hooks. Environment:

| Variable | Value |
| --- | --- |
| `CCMANAGER_WORKTREE_PATH` | path of the new worktree (planned path, for `pre_creation`) |
| `CCMANAGER_WORKTREE_BRANCH` | its branch |
| `CCMANAGER_GIT_ROOT` | repository root |
| `CCMANAGER_BASE_BRANCH` | base branch, when known |

From a `post_creation` hook, reach the main checkout with
`cd "$CCMANAGER_GIT_ROOT" && …`.

---

## `worktree`

```json
{
  "worktree": {
    "autoDirectory": true,
    "autoDirectoryPattern": "../{project}-worktrees/{branch}",
    "copySessionData": true,
    "sortByLastSession": false,
    "autoUseDefaultBranch": false,
    "includeRemoteBranches": false
  }
}
```

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `autoDirectory` | boolean | `false` | Derive the directory from the branch name instead of prompting for it. |
| `autoDirectoryPattern` | string | `"../{branch}"` | Template used when `autoDirectory` is on. |
| `copySessionData` | boolean | `true` | Default answer to "copy Claude Code session data into the new worktree?". |
| `sortByLastSession` | boolean | `false` | Order the worktree list by most recently opened session. |
| `autoUseDefaultBranch` | boolean | `false` | Skip the base-branch prompt; branch off the repository default branch. |
| `includeRemoteBranches` | boolean | `false` | Offer remote branches when picking a base branch. |

Pattern placeholders: `{branch}` and `{project}`, the basename of the main
working directory. (`{branch-name}` appears in CCManager's own documentation but
is left in the path verbatim — the substitution only matches `{word}` with no
dash. Use `{branch}`.) The branch name is sanitised first:
`/` → `-`, anything outside `[A-Za-z0-9._-]` dropped, lower-cased, leading and
trailing dashes trimmed — `Feature/Login` becomes `feature-login`. Relative
patterns resolve against the repository root. A pattern without `{branch}`
produces the same directory for every branch and fails after the first.

---

## `mergeConfig`

```json
{
  "mergeConfig": {
    "mergeArgs": ["--no-ff"],
    "rebaseArgs": ["--autostash"]
  }
}
```

Both arrays are spliced into the command the worktree merge action runs:
`git merge <mergeArgs> "<source-branch>"` and
`git rebase <rebaseArgs> "<target-branch>"`. Defaults: `["--no-ff"]` for merge,
`[]` for rebase. Supplying `mergeArgs` replaces `--no-ff`; include it if you
still want it.

---

## `shortcuts`

```json
{
  "shortcuts": {
    "returnToMenu": {"ctrl": true, "key": "e"},
    "cancel": {"key": "escape"}
  }
}
```

Only two bindings exist: `returnToMenu` (default Ctrl+E) and `cancel` (default
Escape).

- A binding is either `{"key": "escape"}` or `{"ctrl": true, "key": "<single
  character>"}`.
- `alt` and `shift` exist in the type but are rejected when matching a
  keypress — a binding using them can never fire.
- Omitting `ctrl` on a character binding also never matches.
- Avoid Ctrl+C, Ctrl+D and Ctrl+[ — the terminal claims them first.

Legacy `~/.config/ccmanager/shortcuts.json` is migrated into the global
`config.json` automatically on first run.

---

## `autoApproval`

Experimental. When a session stops on a permission prompt, CCManager asks a
helper whether the action needs a human, and presses Enter for you if it does
not.

```json
{
  "autoApproval": {
    "enabled": true,
    "timeout": 120,
    "customCommand": "my-approver"
  }
}
```

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `enabled` | boolean, required | `false` | Turns the feature on. |
| `timeout` | number (seconds) | `120` | Verification is killed after this and the prompt goes back to you. |
| `customCommand` | string | — | Replaces the built-in check. |

Without `customCommand`, CCManager runs the installed `claude` CLI
(`claude --model <model> -p --output-format json --json-schema …`); it is not
bundled, so it must be on `PATH`.

A `customCommand` runs through the shell with `DEFAULT_PROMPT` and
`TERMINAL_OUTPUT` in its environment and must print
`{"needsPermission": true|false, "reason"?: "…"}` on stdout. Anything else — a
parse failure, a non-zero exit, the timeout — is treated as "permission
needed", which leaves the prompt to you. Auto-approval only ever sends Enter,
so it suits confirmation prompts and nothing else.

---

## Keys that do **not** exist

Silently ignored if you write them:

- `command` / `command.name` — an older CCManager shape. Use `commandPresets`.
- `presets` at the top level — it belongs inside `commandPresets`.
- `devcontainer` — devcontainer support is driven by CLI flags, not by these
  files.
- `multiProject` — multi-project mode comes from the
  `CCMANAGER_MULTI_PROJECT_ROOT` environment variable and `--multi-project`.
