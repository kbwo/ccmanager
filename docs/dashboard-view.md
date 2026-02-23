# Dashboard View

Spec for replacing the multi-project `ProjectList` screen with a unified Dashboard that surfaces all active sessions across every repository in one view.

Relates to [GitHub issue #174](https://github.com/kbwo/ccmanager/issues/174) — "True multi repo view".

## Motivation

The current multi-project flow requires three steps to reach a running session:

```
ProjectList → select project → Menu → select worktree → Session
```

For users managing many concurrent AI sessions across repos this is too deep. The Dashboard collapses the first two levels so that any active session is reachable with a single selection from the entry screen.

## UI Layout

```
ccmanager v3.8.1                             ● Busy  ◐ Waiting  ○ Idle

── Active Sessions ──────────────────────────────────────────────────────
  1 ❯ my-app :: feature/auth            ● Busy      +3 -1  ↑1  (main)
  2 ❯ my-app :: fix/login-bug           ◐ Waiting   +1
  3 ❯ api-server :: main                ○ Idle              ↓2  (develop)
  4 ❯ shared-lib :: refactor/types      ● Busy      +5 -2  ↑3  (main)

── Projects ─────────────────────────────────────────────────────────────
  5 ❯ my-app                            (1 Busy / 1 Waiting)
  6 ❯ api-server                        (1 Idle)
  7 ❯ shared-lib                        (1 Busy)
  8 ❯ docs-site

── Other ────────────────────────────────────────────────────────────────
  R 🔄 Refresh
  Q ⏻  Exit
```

The header shows the version string and the status legend (reusing `STATUS_ICONS` / `STATUS_LABELS` from `src/constants/statusIcons.ts`).

## Sections

### Active Sessions

All sessions returned by `globalSessionOrchestrator.getAllActiveSessions()`, sorted by:

1. State priority — `busy` first, then `waiting_input` / `pending_auto_approval`, then `idle`.
2. Within the same state, by `lastActivity` descending (most recent first).

Each row displays:

| Column | Source | Example |
|--------|--------|---------|
| Index | Sequential number, `0`–`9` for hotkey-eligible rows | `1` |
| Label | `project :: branch` (see Naming below) | `my-app :: feature/auth` |
| State indicator | `getStatusDisplay(state, bgCount, teamCount)` | `● Busy` |
| File changes | `gitStatus.filesAdded` / `filesDeleted` | `+3 -1` |
| Ahead / behind | `gitStatus.aheadCount` / `behindCount` | `↑1` |
| Parent branch | `gitStatus.parentBranch` | `(main)` |

Git status columns follow the same alignment logic used in `Menu.tsx` today (`calculateColumnPositions` / `assembleWorktreeLabel` from `src/utils/worktreeUtils.ts`). A `[fetching...]` placeholder appears while git status is loading; `[git error]` on failure.

**Naming format** — `project :: branch`:

- `project` is `GitProject.name` (the directory name).
- `branch` is `Worktree.branch` (the checked-out branch of the worktree the session is attached to).
- If `branch` is `undefined` (detached HEAD), show the last path segment of `Worktree.path` instead.
- The `::` separator visually distinguishes project from branch without ambiguity in search.

If two projects share the same `name` (e.g. nested forks), fall back to `GitProject.relativePath` instead of `name`.

**Auto-approval indicator** — when auto-approval is globally enabled, append the same `[Auto]` / `[Auto OFF]` badge shown in Menu today.

### Projects

All discovered projects from `projectManager.discoverProjectsEffect(projectsDir)`. Recent projects (from `projectManager.getRecentProjects()`) appear first, followed by the remaining projects sorted alphabetically.

Each row displays:

| Column | Source | Example |
|--------|--------|---------|
| Index | Continues from last session index | `5` |
| Label | `GitProject.name` | `my-app` |
| Session counts | `SessionManager.formatSessionCounts(counts)` | `(1 Busy / 1 Waiting)` |

Projects with zero sessions show no count suffix.

### Other

Static action items, same as the current `ProjectList` footer:

- `R 🔄 Refresh` — re-discover projects, refresh all session state.
- `Q ⏻ Exit` — quit the application.

Section separators (`── Active Sessions ──`, `── Projects ──`, `── Other ──`) are non-selectable label-only items, consistent with Menu's existing separator pattern.

## Data Sources

| Data | Provider | Refresh strategy |
|------|----------|-----------------|
| All active sessions | `globalSessionOrchestrator.getAllActiveSessions()` | Re-query on `sessionCreated`, `sessionDestroyed`, `sessionStateChanged` events from each `SessionManager` |
| Session state | `session.stateMutex.getSnapshot().state` | Pushed via `sessionStateChanged` event (checked every 100 ms internally) |
| Git status per session worktree | `useGitStatus` hook (polls every 5 s) | Same hook already used by Menu |
| Discovered projects | `projectManager.discoverProjectsEffect(projectsDir)` | On mount + manual refresh (`R`) |
| Recent projects | `projectManager.getRecentProjects()` | On mount + after any project selection |
| Session counts per project | `globalSessionOrchestrator.getProjectSessions(path)` → `SessionManager.getSessionCounts()` | Same event-driven refresh as sessions |
| Worktree branch name | `worktreeService.getWorktreesEffect()` per project that has sessions | Cached; refreshed on mount |

### Mapping sessions to projects

`globalSessionOrchestrator` stores sessions keyed by project path. To build the session rows the Dashboard iterates each project's `SessionManager`, calls `getAllSessions()`, and joins each `Session.worktreePath` against `worktreeService.getWorktreesEffect()` to resolve the branch name and git status.

## Interaction Model

### Hotkeys

| Key | Context | Action |
|-----|---------|--------|
| `0`–`9` | Any | Select the item at that index (sessions first, then projects) |
| `↑` / `↓` | Any | Move highlight through all selectable items |
| `Enter` | Session row highlighted | Navigate to that session's terminal view |
| `Enter` | Project row highlighted | Navigate to that project's Menu (worktree list) |
| `/` | Any | Enter search mode (reuses `useSearchMode` hook) |
| `ESC` | In search mode | Exit search mode, keep filter |
| `ESC` | Outside search | Clear filter |
| `r` | Not in search | Refresh projects and sessions |
| `q` / `x` | Not in search | Exit application |

### Search

Search uses the existing `useSearchMode` hook. The query filters across both sections simultaneously:

- Session rows match against the full `project :: branch` label.
- Project rows match against the project name.
- Section separators are hidden during search.
- Index numbers are hidden during search (consistent with current Menu/ProjectList behavior).

### Scroll / display limit

The visible item count is dynamic, matching Menu's formula:

```
limit = Math.max(5, stdout.rows - fixedRows - searchModeOffset - errorOffset)
```

where `fixedRows` accounts for the header, status legend, and bottom padding. Ink's `SelectInput` handles scrolling within the limit.

## Navigation Flow

```
                    ┌─────────────────────────────────────────┐
                    │              Dashboard                  │
                    │  ┌─────────────────────────────────┐    │
                    │  │  Active Sessions                │    │
                    │  │  select row ──────────────────────────┼──► Session view
                    │  └─────────────────────────────────┘    │      │
                    │  ┌─────────────────────────────────┐    │      │
                    │  │  Projects                       │    │      │
                    │  │  select row ──────────────────────────┼──► Menu (worktree list)
                    │  └─────────────────────────────────┘    │      │
                    └─────────────────────────────────────────┘      │
                         ▲                                          │
                         │  exit session / back from Menu           │
                         └──────────────────────────────────────────┘
```

### Session selection

1. User highlights a session row and presses `Enter` (or uses `0`–`9`).
2. `App.tsx` sets `selectedProject` to the session's parent `GitProject` and `activeSession` to the matched `ISession`.
3. `App.tsx` calls `navigateWithClear()` to transition to `view = 'session'`.
4. The `SessionView` component renders the terminal for that session.
5. On session exit, `App.tsx` returns to `view = 'project-list'` (which now renders the Dashboard).

### Project selection

1. User highlights a project row and presses `Enter` (or uses `0`–`9`).
2. `App.tsx` sets `selectedProject`, instantiates the project's `SessionManager` and `WorktreeService`, and navigates to `view = 'menu'`.
3. This is the same flow as today's `ProjectList.onSelectProject`.
4. From Menu, pressing `B` returns to `view = 'project-list'` (Dashboard).

### Back navigation

- From Session view: return to Dashboard (not to Menu, since the session was selected directly).
- From Menu: `B` returns to Dashboard.
- The `view` value `'project-list'` is reused; the rendered component changes from `ProjectList` to `Dashboard`.

## Edge Cases

### No active sessions

The "Active Sessions" section is omitted entirely (no separator, no empty-state message). The Dashboard shows only "Projects" and "Other", which is functionally equivalent to the current `ProjectList`.

### No discovered projects

Show an error message with setup instructions, same as current `ProjectList` behavior when `discoverProjectsEffect` returns an empty list or fails.

### Duplicate branch names across projects

Not a problem — the `project :: branch` format always disambiguates. Two projects can both have a `main` session; they render as `my-app :: main` and `api-server :: main`.

### Duplicate project names

When two `GitProject` entries share the same `name` (e.g., `~/projects/team-a/utils` and `~/projects/team-b/utils`), use `relativePath` instead of `name` in the label: `team-a/utils :: main`.

### Loading states

- **Initial load**: Show a spinner with "Discovering projects..." (same as current ProjectList).
- **Session data**: Sessions are event-driven and available immediately from `globalSessionOrchestrator` — no loading state needed.
- **Git status**: Show `[fetching...]` per row until status resolves, same as Menu.

### Error display

Reuse the existing error banner pattern from ProjectList: a dismissible `<Box>` at the top showing `AppError` messages. Dismiss with any key.

### Terminal resize

Recalculate `limit` on `stdout.rows` change. Column positions recalculate automatically via `calculateColumnPositions`.

## Affected Files

| File | Change |
|------|--------|
| `src/components/Dashboard.tsx` | **New.** Replaces `ProjectList.tsx` as the multi-project entry view. |
| `src/components/App.tsx` | Render `Dashboard` instead of `ProjectList` when `view === 'project-list'`. Handle session-direct-connect callback from Dashboard. |
| `src/components/ProjectList.tsx` | **Remove** or keep as dead code for reference. Dashboard subsumes its functionality. |
| `src/utils/worktreeUtils.ts` | Extend `prepareWorktreeItems` (or add a parallel helper) to accept a project name prefix for the `project :: branch` label format. |
| `src/hooks/useGitStatus.ts` | No changes needed — Dashboard reuses this hook, passing worktree paths from all projects with active sessions. |
| `src/hooks/useSearchMode.ts` | No changes needed — reused as-is. |
| `src/services/globalSessionOrchestrator.ts` | May need a helper to return sessions grouped by project path, or the Dashboard can group them client-side. |
| `src/types/index.ts` | Add `Dashboard`-specific item types to the `MenuItem` union if needed, or define a local `DashboardItem` discriminated union in `Dashboard.tsx`. |
| `docs/multi-project.md` | Update navigation flow section and "Future Enhancements" to reflect Dashboard. |

## Architectural Notes

- The Dashboard is a **read-only aggregation view** — it does not create, destroy, or modify sessions or worktrees. All mutations happen in Menu or Session views.
- Event-driven refresh (via `SessionManager` events) keeps the view live without polling for session state. Git status continues to poll via `useGitStatus`.
- The existing `View` union type in `App.tsx` does not need a new value. The `'project-list'` view simply renders `Dashboard` instead of `ProjectList`.
- `useSearchMode` is shared across Dashboard, Menu, and the former ProjectList, keeping search behavior consistent.
- Column alignment for git status reuses `calculateColumnPositions` so that the Dashboard and Menu look visually consistent.
