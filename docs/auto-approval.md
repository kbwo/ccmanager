# Auto Approval (Experimental)

## Overview
- Auto approval lets CCManager decide whether a paused Claude Code session can continue without you typing Enter.
- When enabled, CCManager checks a waiting prompt and either auto-approves it or leaves it for your manual review.
- The feature is experimental—expect occasional false positives/negatives and keep an eye on prompts that matter.
- Default expectation: CCManager assumes the `claude` CLI is already installed and on your PATH; it is **not** bundled. If you don’t have `claude`, either install it or set a custom command.

## Enabling It (UI)
1. Run `ccmanager`.
2. Open **Configuration** → **Other & Experimental**.
3. Choose **Auto Approval (experimental)** to toggle it to ✅ Enabled.
4. (Optional) Pick **Edit Custom Command** to supply your own approver command (see "Custom Command" below).
5. Select **Save Changes**.

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

## Custom Command (optional power users)
- Purpose: replace the default `claude --model haiku` call (uses your installed `claude` CLI; CCManager does not bundle it) with any executable or script you control.
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
- **Approval step:** By default CCManager runs `claude --model haiku -p --output-format json --json-schema …`, passing the captured terminal output into the prompt so Claude can judge whether the action needs your permission.
- **Decision:** If Claude replies that permission is not needed and the session is still waiting, CCManager sends a carriage return (`\r`) to the session—equivalent to pressing Enter for you. If Claude says permission is needed, the check times out (60s), errors, or you press any key while it’s pending, auto approval stops and the session stays in manual approval with a short reason displayed.
- **Safety:** When the helper fails for any reason, CCManager defaults to requiring your approval instead of proceeding automatically.

## Things to Keep in Mind
- Requires the `claude` CLI to be installed and accessible in your PATH (or supply a custom command).
- Auto-approval only sends `\r` (Enter). It is unsuitable for CLIs that expect arbitrary typed input beyond a simple confirmation.
- Experimental: review critical prompts yourself, especially before running commands that change files or system settings.
- You can always interrupt by typing anything while the status bar says “Auto-approval pending…”.
