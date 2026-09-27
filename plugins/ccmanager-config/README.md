# ccmanager-config

An agent skill that writes, reviews, and repairs CCManager configuration —
`.ccmanager.json` in a git repository root, and the global
`~/.config/ccmanager/config.json`.

It exists because CCManager stays silent about bad configuration: a file that
is not valid JSON is discarded whole, and unknown keys are ignored without a
message, so a typo looks exactly like a feature that does not work. The skill
carries the full key reference, worked examples, and a validator that catches
those silent failures.

## Install

The plugin lives in this repository, which doubles as a plugin marketplace.

**Claude Code**

```bash
claude plugin marketplace add kbwo/ccmanager
claude plugin install ccmanager-config@ccmanager
```

**Codex CLI**

```bash
codex plugin marketplace add kbwo/ccmanager
codex plugin add ccmanager-config@ccmanager
```

Both read the marketplace from [`.claude-plugin/marketplace.json`](../../.claude-plugin/marketplace.json)
at the repository root. To try a local checkout instead, pass its path in place
of `kbwo/ccmanager`.

Once installed, ask for what you want in plain language — "set this repo up to
run codex in ccmanager", "notify me when a session is waiting", "why is my
`.ccmanager.json` being ignored?" — and the agent loads the skill on its own.

## Contents

| Path | What it is |
| --- | --- |
| `skills/ccmanager-config/SKILL.md` | the procedure the agent follows |
| `skills/ccmanager-config/references/config-reference.md` | every config key: type, default, behaviour |
| `skills/ccmanager-config/references/recipes.md` | copy-and-adapt configurations per goal |
| `skills/ccmanager-config/schema/ccmanager.schema.json` | JSON Schema for both config files |
| `skills/ccmanager-config/scripts/validate-ccmanager-config.mjs` | validator, also usable on its own |

The validator needs nothing but Node:

```bash
node skills/ccmanager-config/scripts/validate-ccmanager-config.mjs path/to/.ccmanager.json
```

## Editor completion

Point your editor at the schema by adding `$schema` to the config file — CCManager
ignores the key:

```json
{
  "$schema": "https://raw.githubusercontent.com/kbwo/ccmanager/main/plugins/ccmanager-config/skills/ccmanager-config/schema/ccmanager.schema.json"
}
```
