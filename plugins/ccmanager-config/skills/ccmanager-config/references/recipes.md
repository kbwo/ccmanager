# CCManager configuration recipes

Working starting points, one per goal. Adapt, then validate with
`scripts/validate-ccmanager-config.mjs`. Key-by-key meaning lives in
`config-reference.md`.

Unless stated otherwise these go in `.ccmanager.json` at the **main** git
repository root; the same JSON is valid in `~/.config/ccmanager/config.json`.

---

## Run a different agent CLI for this repository

Everyone opening this repository gets Codex instead of Claude Code.
`detectionStrategy` is what makes the idle/busy/waiting indicator correct — do
not omit it.

```json
{
  "commandPresets": {
    "presets": [
      {
        "id": "codex",
        "name": "Codex",
        "command": "codex",
        "detectionStrategy": "codex"
      }
    ],
    "defaultPresetId": "codex"
  }
}
```

## Offer several agents, and choose per session

`selectPresetOnStart` shows the picker every time a session starts; without it
the `defaultPresetId` preset starts silently.

```json
{
  "commandPresets": {
    "presets": [
      {
        "id": "claude",
        "name": "Claude (resume)",
        "command": "claude",
        "args": ["--resume"],
        "fallbackArgs": []
      },
      {
        "id": "claude-plan",
        "name": "Claude (opus, plan mode)",
        "command": "claude",
        "args": ["--model", "opus", "--permission-mode", "plan"],
        "fallbackArgs": ["--model", "opus"]
      },
      {
        "id": "codex",
        "name": "Codex",
        "command": "codex",
        "detectionStrategy": "codex"
      }
    ],
    "defaultPresetId": "claude",
    "selectPresetOnStart": true
  }
}
```

`fallbackArgs` is the single retry when the first launch fails — keep it to a
combination that always starts. `[]` retries the bare command.

## Get notified when a session wants your attention

Personal taste, so this belongs in the **global** config. Replace `terminal-notifier`
with whatever the machine has (`notify-send`, `noti`, `osascript`, …).

```json
{
  "statusHooks": {
    "waiting_input": {
      "command": "terminal-notifier -title CCManager -message \"waiting: $CCMANAGER_WORKTREE_BRANCH\"",
      "enabled": true
    },
    "idle": {
      "command": "terminal-notifier -title CCManager -message \"done: $CCMANAGER_WORKTREE_BRANCH\"",
      "enabled": true
    }
  }
}
```

Do not hook `busy`: it fires constantly.

## Make a new worktree usable immediately

Untracked but required files (`.env`, local settings) do not come along with a
new worktree, and dependencies are not installed. A `post_creation` hook runs
inside the fresh worktree, so relative paths refer to it and
`$CCMANAGER_GIT_ROOT` refers to the main checkout.

```json
{
  "worktreeHooks": {
    "post_creation": {
      "command": "cp \"$CCMANAGER_GIT_ROOT/.env\" . 2>/dev/null; bun install",
      "enabled": true
    }
  }
}
```

Keep it non-interactive and reasonably quick — worktree creation waits for it.

## Refuse worktrees that break the branch convention

`pre_creation` runs in the git root and a non-zero exit aborts creation, so it
works as a gate. Write the reason to stderr; it is shown to the user.

```json
{
  "worktreeHooks": {
    "pre_creation": {
      "command": "case \"$CCMANAGER_WORKTREE_BRANCH\" in feature/*|fix/*|chore/*) exit 0;; *) echo 'branch must start with feature/, fix/ or chore/' >&2; exit 1;; esac",
      "enabled": true
    }
  }
}
```

## Put every worktree in one predictable directory

Stops CCManager asking for a path, and keeps worktrees out of the repository.
`{project}` is the main checkout's directory name, `{branch}` the branch with
`/` turned into `-`; `feature/login` in `myapp` lands in
`../myapp-worktrees/feature-login`.

```json
{
  "worktree": {
    "autoDirectory": true,
    "autoDirectoryPattern": "../{project}-worktrees/{branch}",
    "autoUseDefaultBranch": true,
    "sortByLastSession": true
  }
}
```

Drop `autoUseDefaultBranch` if branches are often cut from something other than
the default branch — it removes the base-branch prompt entirely.

## Change how the merge action integrates a worktree

The default is `git merge --no-ff <source>`. To fast-forward instead, or to make
rebase stash local edits first:

```json
{
  "mergeConfig": {
    "mergeArgs": ["--ff-only"],
    "rebaseArgs": ["--autostash"]
  }
}
```

`mergeArgs` replaces the default, so re-list `--no-ff` if you want to keep it.

## Free up Ctrl+E for the agent

Global config; `returnToMenu` must be replaced as a whole object.

```json
{
  "shortcuts": {
    "returnToMenu": {"ctrl": true, "key": "g"},
    "cancel": {"key": "escape"}
  }
}
```

Ctrl only. Ctrl+C, Ctrl+D and Ctrl+[ are taken by the terminal.

## Auto-approve routine prompts (experimental)

CCManager asks a helper whether a waiting prompt needs a human, and presses
Enter when it does not. The built-in helper shells out to the `claude` CLI, so
it must be installed.

```json
{
  "autoApproval": {
    "enabled": true,
    "timeout": 120
  }
}
```

To judge with something else, print the verdict as JSON on stdout. The prompt
arrives in `$DEFAULT_PROMPT`, the captured terminal output in
`$TERMINAL_OUTPUT`; anything unparseable, a non-zero exit, or the timeout means
"ask the human".

```json
{
  "autoApproval": {
    "enabled": true,
    "customCommand": "codex exec --json \"$DEFAULT_PROMPT\" --output-schema /abs/path/auto-approval.schema.json --output-last-message /tmp/codex-approval.json > /dev/null && cat /tmp/codex-approval.json"
  }
}
```

(`auto-approval.schema.json` ships in the CCManager repository under `docs/`
and is not installed with the binary — keep a local copy.)

## A full project file

Everything a repository would reasonably pin, in one file:

```json
{
  "commandPresets": {
    "presets": [
      {
        "id": "claude",
        "name": "Claude",
        "command": "claude",
        "args": ["--resume"],
        "fallbackArgs": []
      },
      {
        "id": "codex",
        "name": "Codex",
        "command": "codex",
        "detectionStrategy": "codex"
      }
    ],
    "defaultPresetId": "claude",
    "selectPresetOnStart": true
  },
  "worktree": {
    "autoDirectory": true,
    "autoDirectoryPattern": "../{project}-worktrees/{branch}",
    "copySessionData": true,
    "sortByLastSession": true
  },
  "worktreeHooks": {
    "post_creation": {"command": "bun install", "enabled": true}
  },
  "mergeConfig": {
    "mergeArgs": ["--no-ff"]
  }
}
```
