---
name: ccmanager-config
description: Set up, review, or repair a CCManager config — `.ccmanager.json` at a git repository root, or the global `~/.config/ccmanager/config.json`. Use when someone wants ccmanager to launch a different agent CLI (codex, gemini, cursor-agent, copilot…), add command presets, run a command on session state changes or worktree creation, auto-generate worktree directory paths, change merge/rebase arguments, rebind the return-to-menu key, turn on auto-approval — or when a ccmanager setting "does not seem to do anything".
---

# Configuring CCManager

CCManager (`ccmanager`) is a terminal UI that runs one AI coding agent per git
worktree. Its behaviour comes from two JSON files with **identical shape**:

| File | Scope | Notes |
| --- | --- | --- |
| `<git repository root>/.ccmanager.json` | one repository | commit it to share with the team |
| `~/.config/ccmanager/config.json` (`%APPDATA%\ccmanager\config.json` on Windows) | the user, all repositories | also written by ccmanager's own **Global Configuration** menu |

Per key, the project file wins over the global file. Both are optional.

The reason this skill exists: **CCManager reports nothing when a config is
wrong.** A file that is not valid JSON is discarded whole, and unknown keys are
ignored without a message, so a typo is indistinguishable from a feature that
does not work. Every change made through this skill therefore ends with the
validator run in step 4.

## Procedure

### 1. Decide which file to edit

Ask yourself, and the user if it is genuinely ambiguous:

- Does the setting describe **the repository** (which agent CLI to run, what to
  do after a worktree is created, where worktrees live)? → `.ccmanager.json`,
  committed.
- Does it describe **this person's machine or taste** (notification commands,
  key bindings, personal API/model flags)? → the global `config.json`.

Two traps before you write anything:

- Put `.ccmanager.json` **at the main repository root**, not inside a linked
  worktree. CCManager resolves any worktree back to the main checkout, so a
  config file inside a worktree is never read.
- If ccmanager is started in multi-project mode (the
  `CCMANAGER_MULTI_PROJECT_ROOT` environment variable is set, or `--multi-project`
  is passed), project files are skipped entirely and only the global config
  applies. Say so rather than writing a file that will be ignored.

### 2. Read what is already there

`cat` the target file if it exists, plus the other file in the pair when the
user's request depends on the merged result. Never rewrite a config from
scratch when one exists — you would silently drop settings you were not asked
about.

### 3. Write the config

Look every key up in **`references/config-reference.md`** (in this skill
directory) before writing it: it lists each key with its type, its default, and
what it actually does. Do not invent keys — anything not listed there is
dropped by CCManager without a word.

For the common goals — running codex/gemini/another CLI, several presets,
desktop notifications, per-worktree setup commands, worktree path patterns,
merge arguments, auto-approval — start from a worked example in
**`references/recipes.md`** and adapt it.

Three rules that cause most of the breakage:

1. **Merging happens one key deep.** For each top-level key present in the
   project file, that key's *fields* override the global ones; anything nested
   below a field is replaced wholesale, not merged. In particular a project
   `commandPresets.presets` array replaces the global preset list entirely — so
   list every preset the repository needs, and give `defaultPresetId` the id of
   one of *those* presets.
2. **`args` is argv, one array element per token.** `["--model", "opus"]`, never
   `["--model opus"]`.
3. **A hook without `"enabled": true` never runs.** Both `command` and `enabled`
   are required.

### 4. Validate — always

```bash
node <skill-dir>/scripts/validate-ccmanager-config.mjs path/to/.ccmanager.json
```

It parses the file the way CCManager does, checks the shape against
`schema/ccmanager.schema.json`, flags unknown keys (with a "did you mean"), and
catches the mistakes JSON alone cannot express: a `defaultPresetId` matching no
preset, duplicate preset ids, an `args` entry with spaces in it, a detection
strategy that does not match the command, a shortcut that can never fire, a
disabled hook, a worktree pattern without `{branch}`, a config file sitting in a
linked worktree. It exits non-zero on errors; warnings are advisory.

Report what it printed. If you cannot run it (no Node available), say so
explicitly instead of claiming the config is fine.

### 5. Tell the user how to pick it up

CCManager reads config at start-up and when it reloads. After editing a file by
hand, they should return to the ccmanager menu or restart it; sessions already
running keep the command and detection strategy they were started with.

## Reviewing an existing config ("this setting does nothing")

Work down this list — these are the silent failures, in the order they bite:

1. Run the validator (step 4). Invalid JSON and unknown/misspelled keys are the
   two most common causes and both are invisible in the TUI.
2. Check the file location: main repository root, not a worktree; and
   multi-project mode disabled.
3. Check the *other* file. The project file only overrides keys it actually
   contains; everything else still comes from the global config.
4. For presets: a `defaultPresetId` pointing at a preset that lives in the other
   file silently falls back to the first preset in the list.
5. For a session that reports the wrong status: `detectionStrategy` must match
   the CLI being run — see the table in `references/config-reference.md`.

## Files in this skill

- `references/config-reference.md` — every key: type, default, behaviour, and
  the hook environment variables.
- `references/recipes.md` — copy-and-adapt configurations for the usual goals.
- `schema/ccmanager.schema.json` — JSON Schema for both config files; usable as
  `$schema` in an editor for completion.
- `scripts/validate-ccmanager-config.mjs` — the validator from step 4.
