# Git Worktree Configuration for Enhanced Status

CCManager can display enhanced git status information for each worktree, including file changes, commits ahead/behind relative to parent branches, and parent branch context. This requires enabling Git's worktree configuration extension.

## What You Get

### With Worktree Config Enabled
- **File change counts**: `+10 -5` (additions/deletions)
- **Ahead/behind indicators**: `↑3 ↓1` (commits ahead/behind parent)
- **Parent branch name**: Shown in dim text (e.g., `main`)
- **Accurate tracking**: Each worktree remembers its parent branch

### Without Worktree Config (Default)
- **Basic file changes**: `+10 -5` only
- **No ahead/behind information**
- **No parent branch tracking**

## Enabling Worktree Configuration

To enable the full diff visualization features, run:

```bash
# Enable for current repository
git config extensions.worktreeConfig true

# Or enable globally for all repositories
git config --global extensions.worktreeConfig true
```

## How It Works

### Git's Worktree Configuration Extension

The `extensions.worktreeConfig` setting enables Git to store configuration values specific to each worktree, rather than sharing them across all worktrees in a repository.

When enabled:
1. Git creates a `.git/worktrees/<worktree-name>/config.worktree` file
2. Worktree-specific settings are stored separately from the main config
3. Each worktree can have independent configuration values

### CCManager's Parent Branch Tracking

CCManager uses this feature to:
1. Store the parent branch name when creating a worktree
2. Calculate accurate ahead/behind counts relative to the parent
3. Display meaningful diff information for each worktree

Example workflow:
```bash
# Create a worktree from 'main' branch
$ ccmanager  # Create worktree 'feature/login' from 'main'

# CCManager stores in worktree config:
# ccmanager.parentBranch = main

# Later, CCManager shows:
# feature/login [↑3 ↓1 main] +25 -10
# Meaning: 3 commits ahead, 1 behind main, with 25 additions and 10 deletions
```

## Visual Indicators

### Status Bar Format
```
<branch-name> [<ahead-behind> <parent>] <file-changes>
```

Examples:
- `feature/auth [↑5 ↓2 develop] +120 -45` - Feature branch ahead of develop
- `hotfix/security [↑1 main] +15 -3` - Hotfix with changes ready to merge
- `experiment/ai [↓10 main] +200 -50` - Experimental branch behind main

### Color Coding
- **Green**: Ahead commits (↑)
- **Red**: Behind commits (↓)
- **Dim**: Parent branch name
- **Default**: File changes

## Benefits

### 1. Context Awareness
Know immediately which branch your worktree was created from, essential for:
- Understanding merge direction
- Identifying stale branches
- Planning rebases

### 2. Accurate Comparisons
Without worktree config, CCManager would need to guess or use a default branch (like `main`), which may not reflect the actual parent relationship.

### 3. Independent Tracking
Each worktree maintains its own parent reference, allowing:
- Multiple worktrees from different parents
- Accurate tracking even after branch renames
- Preservation of workflow context

## Technical Details

### Configuration Storage
When you create a worktree with CCManager:
```bash
# Stored in .git/worktrees/<name>/config.worktree
[ccmanager]
    parentBranch = main
```

### Status Calculation
CCManager runs these git commands internally:
```bash
# Get file changes
git diff --shortstat

# Get ahead/behind counts (when parent is known)
git rev-list --left-right --count <parent>...<current-branch>
```

### Graceful Degradation
If worktree config is not enabled:
- File changes are still shown
- Ahead/behind information is omitted
- No error messages displayed
- Feature degrades gracefully

## Common Scenarios

### Setting Up a New Repository
```bash
cd my-project
git config extensions.worktreeConfig true
ccmanager  # Now with full status tracking
```

### Enabling for Existing Worktrees
```bash
# Enable the extension
git config extensions.worktreeConfig true

# Recreate worktrees or manually set parent branches
git config --worktree ccmanager.parentBranch main
```

### Global Configuration
For developers who frequently use worktrees:
```bash
git config --global extensions.worktreeConfig true
```

## Troubleshooting

### Not Seeing Ahead/Behind Counts?
1. Check if worktree config is enabled:
   ```bash
   git config extensions.worktreeConfig
   ```
2. Verify parent branch is set:
   ```bash
   git config --worktree ccmanager.parentBranch
   ```

### Incorrect Parent Branch?
Manually update the parent branch:
```bash
git config --worktree ccmanager.parentBranch develop
```

### Performance Considerations
The ahead/behind calculation is fast for most repositories but may be slower for:
- Very large repositories
- Branches with extensive divergence
- Repositories with deep history

In these cases, the status might show a loading indicator briefly.

## Best Practices

1. **Enable Early**: Set up worktree config when starting a new project
2. **Global Setting**: Consider enabling globally if you use worktrees frequently
3. **Team Consistency**: Document this requirement in your team's setup guide
4. **CI/CD**: Ensure build systems have this enabled for accurate status reporting