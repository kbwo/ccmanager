# Auto Approval (Experimental)

## Overview

- Auto approval lets CCManager decide whether a paused Claude Code session can continue without you typing Enter.
- When enabled, CCManager checks a waiting prompt and either auto-approves it or leaves it for your manual review.
- The feature is experimental—expect occasional false positives/negatives and keep an eye on prompts that matter.
- Default expectation: CCManager assumes the `claude` CLI is already installed and on your PATH; it is **not** bundled. If you don’t have `claude`, either install it or set a custom command.

## Enabling It (UI)

1. Run `ccmanager`.
2. Open **Global Configuration** → **Other & Experimental**.
3. Choose **Auto Approval (experimental)** to toggle it to ✅ Enabled.
4. Choose the verifier. Select **MiniMax** to configure its model, region, and compatibility protocol.
5. (Optional) Pick **Edit Custom Command** to supply your own approver command (see "Custom Command" below).
6. Select **Save Changes**.

## Enabling It (config file)

If you prefer editing the config directly:

- Linux/macOS: `~/.config/ccmanager/config.json`
- Windows: `%APPDATA%\\ccmanager\\config.json`

Set:

```json
{
	"autoApproval": {
		"enabled": true
	}
}
```

Leave `"enabled": false` to turn it off. You can also add `"customCommand": "my-checker"` if you want CCManager to call something other than the default Claude command.

## MiniMax Verifier

Set `verifier` to `minimax` to call MiniMax directly:

```json
{
	"autoApproval": {
		"enabled": true,
		"verifier": "minimax",
		"minimaxModel": "MiniMax-M3",
		"minimaxRegion": "global_en",
		"minimaxProtocol": "openai"
	}
}
```

Supported settings:

- `minimaxModel`: `MiniMax-M3` or `MiniMax-M2.7`.
- `minimaxRegion`: `global_en` or `cn_zh`.
- `minimaxProtocol`: `openai` or `anthropic`.
- Credential: set `MINIMAX_API_KEY` in the environment before starting CCManager.

The verifier uses the matching documented endpoint:

| Region | OpenAI-compatible             | Anthropic-compatible                 |
| ------ | ----------------------------- | ------------------------------------ |
| Global | `https://api.minimax.io/v1`   | `https://api.minimax.io/anthropic`   |
| CN     | `https://api.minimaxi.com/v1` | `https://api.minimaxi.com/anthropic` |

Responses must match the same `{"needsPermission": true|false, "reason"?: "short string"}` contract used by the default verifier. Missing credentials, unsupported settings, request failures, timeouts, malformed response envelopes, and schema mismatches all require manual approval.

## Custom Command (optional power users)

- Purpose: override the selected verifier with any executable or script you control.
- How CCManager calls it:
  - Runs via your shell: `spawn(customCommand, [], {shell: true})`.
  - Environment variables provided:
    - `DEFAULT_PROMPT`: the exact prompt text CCManager would have sent to Claude (includes the terminal output and instructions).
    - `TERMINAL_OUTPUT`: the captured terminal output (same content embedded in `DEFAULT_PROMPT`).
  - Timeout: 60 seconds; if it hangs, CCManager kills it and falls back to manual approval.
- Expected output: the command must print JSON to stdout matching `{"needsPermission": true|false, "reason"?: "short string"}`. If parsing fails or the exit code is non‑zero, CCManager treats it as “permission needed”.
- Tips:
  - Keep it lightweight; long-running analysis will delay your prompt.
  - You can wrap other models/tools as long as you emit the JSON schema above.
  - Log to stderr if you need debugging—stderr is ignored except for debug logging.
- Example (Codex): combine the source-tree schema [`auto-approval.schema.json`](./auto-approval.schema.json) with Codex to perform the approval check instead of Claude. The schema ships in the repo but is **not bundled** into installed binaries—use your local copy or download it first:
  ```bash
  codex exec --json "$DEFAULT_PROMPT" \
    --output-schema <path to json>/auto-approval.schema.json \
    --output-last-message /tmp/codex-output.json > /dev/null \
    && cat /tmp/codex-output.json
  ```
  Set this command as your custom command in **Other & Experimental**. CCManager will pass `DEFAULT_PROMPT`/`TERMINAL_OUTPUT`, Codex will write the JSON result to `/tmp/codex-output.json`, and CCManager will read and parse it.

## How It Works

- **When it runs:** If a session enters a prompt state that normally waits for your input, CCManager marks it as “Auto-approval pending…” and grabs the most recent terminal output (up to 300 lines).
- **Approval step:** CCManager runs the selected verifier with the captured terminal output and the auto-approval JSON schema. A custom command, when configured, takes precedence.
- **Decision:** If the verifier replies that permission is not needed and the session is still waiting, CCManager sends a carriage return (`\r`) to the session—equivalent to pressing Enter for you. If permission is needed, the check reaches its configured timeout, errors, or you press any key while it’s pending, auto approval stops and the session stays in manual approval with a short reason displayed.
- **Safety:** When the helper fails for any reason, CCManager defaults to requiring your approval instead of proceeding automatically.

## Things to Keep in Mind

- The default verifier requires the `claude` CLI to be installed and accessible in your PATH. The MiniMax verifier requires `MINIMAX_API_KEY` instead.
- Auto-approval only sends `\r` (Enter). It is unsuitable for CLIs that expect arbitrary typed input beyond a simple confirmation.
- Experimental: review critical prompts yourself, especially before running commands that change files or system settings.
- You can always interrupt by typing anything while the status bar says “Auto-approval pending…”.
