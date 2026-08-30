# Copying Gitignored Files into New Worktrees (`.worktreeinclude`)

A new Git worktree starts with only the files Git tracks. Files that are gitignored but still required to run the project — `.env`, local certificates, generated local configuration — are not carried over, so a freshly created worktree often cannot run until you copy them by hand.

CCManager copies those files for you when the repository root contains a `.worktreeinclude` file: a list, written in gitignore syntax, of the gitignored files that should be carried into every new worktree.

`.worktreeinclude` is not a CCManager-specific file. It is the same file name and the same semantics used by other worktree-aware tools (Claude Code, Conductor, OpenAI Codex, and the standalone `git-worktreeinclude` CLI), so a `.worktreeinclude` you already maintain for one of those tools works with CCManager unchanged — there is no second, CCManager-specific configuration for the same thing.

## Setup

1. Create a `.worktreeinclude` file at the repository root (the main checkout, next to `.git`).
2. List the gitignored files you want in every new worktree, using gitignore syntax.

```gitignore
# .worktreeinclude

# Local environment variables
.env
.env.local

# Local TLS certificates used by the dev server
certs/

# Everything under .secrets/ except the sample file
.secrets/**
!.secrets/example.json
```

The full gitignore pattern syntax applies: `#` comments, `!` negation, a leading `/` to anchor a pattern to the repository root, and `**` globs. A pattern that names a directory selects every gitignored file inside it.

There is no setting to turn this on or off. The copy step runs whenever a `.worktreeinclude` file exists at the repository root, which is how the other tools that read this file behave.

## Which Files Are Copied

A file is copied only when **both** conditions hold:

- it matches a pattern in `.worktreeinclude`, and
- Git actually ignores it — via any `.gitignore` (including nested ones), `.git/info/exclude`, or `core.excludesfile`.

Two consequences follow from the second condition, and they are the safety rule every tool that supports `.worktreeinclude` documents:

- **A tracked file is never copied**, even if it matches a pattern. Git already puts tracked files in the new worktree, so a matching pattern cannot cause a duplicate or a stale copy.
- **An untracked file that is not ignored is never copied.** Listing a pattern does not, by itself, make a file eligible; the repository's ignore rules decide.

To preview what your `.worktreeinclude` selects, run this in the main checkout — it lists the untracked files matching `.worktreeinclude`'s patterns, then keeps only the ones Git really ignores:

```bash
git ls-files --others --ignored --exclude-from=.worktreeinclude -z \
  | git check-ignore --stdin -z \
  | tr '\0' '\n'
```

## When the Copy Happens

During worktree creation, the copy runs after the worktree exists and **before the post-creation worktree hook**, so hook commands can rely on the copied files already being in place — for example, a `post_creation` hook running `npm install && npm run db:migrate` can read the `.env` that was just copied. See [worktree-hooks.md](worktree-hooks.md) for hook configuration.

Other behavior worth knowing:

- **Nested paths are recreated.** A selected file at `config/local/db.json` is copied to the same relative path in the new worktree, creating intermediate directories as needed.
- **An existing destination file is never overwritten.** If the new worktree already has a file at that path, the copy is skipped and a warning is logged.
- **Failures are non-fatal.** If the copy step fails, worktree creation still succeeds and a warning is printed, matching how the other copy steps during worktree creation behave.

## Relationship to the Other Copy Options

CCManager has two other copy features that are configurable and cover different content; `.worktreeinclude` complements rather than replaces them:

| What | Copies | Configurable |
| --- | --- | --- |
| `.worktreeinclude` | Gitignored **project** files selected by patterns at the repository root | No — runs whenever the file exists |
| Copy session data | Claude Code's own session data under `~/.claude/projects/` (see [the README's Session Data Copying section](../README.md#session-data-copying)) | Yes |
| Copy `.claude` directory | The base branch's `.claude` directory | Yes |

## Troubleshooting

**Nothing was copied.**
Run the preview command above. An empty result usually means the file is not actually gitignored — confirm with `git check-ignore -v <path>`. A file that Git does not ignore is intentionally out of scope.

**A file was skipped.**
The destination already existed, or the source disappeared between resolving the list and copying. Both cases log a warning; see the CCManager log for details.
