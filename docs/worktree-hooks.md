# Worktree Hooks

CCManager supports executing custom hooks when worktrees are created, allowing you to automate tasks like setting up development environments, creating configuration files, or sending notifications.

## Configuration

Worktree hooks are configured in the CCManager configuration file (`~/.config/ccmanager/config.json`). You can configure them through the UI or by editing the configuration file directly.

### Available Hooks

#### Pre-Creation Hook

The `pre_creation` hook is executed **before** a new worktree is created. If this hook fails (non-zero exit code), the worktree creation is aborted.

```json
{
  "worktreeHooks": {
    "pre_creation": {
      "command": "your-validation-command",
      "enabled": true
    }
  }
}
```

**Key characteristics:**
- Runs in the **git root directory** (the worktree doesn't exist yet)
- **Failures abort worktree creation** - use this for validation
- Exit code 0 = continue with creation, non-zero = abort

#### Post-Creation Hook

The `post_creation` hook is executed **after** a new worktree is successfully created.

```json
{
  "worktreeHooks": {
    "post_creation": {
      "command": "your-command-here",
      "enabled": true
    }
  }
}
```

**Key characteristics:**
- Runs in the **newly created worktree directory**
- **Failures are logged but don't break the flow** - worktree remains created

## Execution Context

The working directory for hooks depends on the hook type:

| Hook | Working Directory | Worktree Exists? |
|------|-------------------|------------------|
| `pre_creation` | Git root directory | No |
| `post_creation` | New worktree directory | Yes |

For **post-creation hooks**, if you need to execute commands in the git root directory instead, you can use the `CCMANAGER_GIT_ROOT` environment variable:

```bash
cd "$CCMANAGER_GIT_ROOT" && your-command-here
```

For **pre-creation hooks**, you can access the planned worktree path via the `CCMANAGER_WORKTREE_PATH` environment variable, even though it doesn't exist yet.

## Environment Variables

When a worktree hook is executed, the following environment variables are available:

- `CCMANAGER_WORKTREE_PATH`: The absolute path to the newly created worktree
- `CCMANAGER_WORKTREE_BRANCH`: The branch name of the worktree
- `CCMANAGER_GIT_ROOT`: The root path of the git repository
- `CCMANAGER_BASE_BRANCH`: The base branch used to create the worktree (optional)

## Post Creation Hook Examples

### 1. Install dependencies

```bash
npm install
```

### 2. Copy .gitignore files

```extract-untracked.sh
#!/bin/bash

# Check if two arguments are provided
if [ $# -ne 2 ]; then
    echo "Usage: $0 <source_git_root> <destination_directory>"
    echo "  source_git_root: Directory where 'git ls-files' will be executed"
    echo "  destination_directory: Directory where files will be copied to"
    exit 1
fi

SOURCE_DIR="$1"
DEST_DIR="$2"

# Check if source directory exists
if [ ! -d "$SOURCE_DIR" ]; then
    echo "Error: Source directory '$SOURCE_DIR' does not exist"
    exit 1
fi

# Check if source directory is a git repository
if [ ! -d "$SOURCE_DIR/.git" ]; then
    echo "Error: '$SOURCE_DIR' is not a git repository"
    exit 1
fi

# Create destination directory if it doesn't exist
mkdir -p "$DEST_DIR"

# Change to source directory
cd "$SOURCE_DIR" || exit 1

# Get list of untracked directories
UNTRACKED_DIRS=$(git ls-files --others --directory)

# Get list of all untracked files
UNTRACKED_FILES=$(git ls-files --others)

# Copy untracked directories
if [ -n "$UNTRACKED_DIRS" ]; then
    echo "Copying untracked directories..."
    while IFS= read -r dir; do
        if [ -n "$dir" ]; then
            # Remove trailing slash if present
            dir="${dir%/}"
            echo "  Copying directory: $dir"
            mkdir -p "$DEST_DIR/$(dirname "$dir")"
            cp -r "$dir" "$DEST_DIR/$(dirname "$dir")/"
        fi
    done <<< "$UNTRACKED_DIRS"
fi

# Copy untracked files (excluding those in untracked directories)
if [ -n "$UNTRACKED_FILES" ]; then
    echo "Copying untracked files..."
    while IFS= read -r file; do
        if [ -n "$file" ]; then
            # Check if the file is inside any untracked directory
            is_in_dir=false
            if [ -n "$UNTRACKED_DIRS" ]; then
                while IFS= read -r dir; do
                    if [ -n "$dir" ]; then
                        # Remove trailing slash if present
                        dir="${dir%/}"
                        # Check if file starts with directory path
                        if [[ "$file" == "$dir/"* ]]; then
                            is_in_dir=true
                            break
                        fi
                    fi
                done <<< "$UNTRACKED_DIRS"
            fi
            
            # Copy file only if it's not in an untracked directory
            if [ "$is_in_dir" = false ]; then
                echo "  Copying file: $file"
                # Create parent directory if needed
                mkdir -p "$DEST_DIR/$(dirname "$file")"
                cp "$file" "$DEST_DIR/$file"
            fi
        fi
    done <<< "$UNTRACKED_FILES"
fi

echo "Done! Untracked files and directories have been copied to '$DEST_DIR'"

```

```bash
<path to extract-untracked.sh> $CCMANAGER_GIT_ROOT $CCMANAGER_WORKTREE_PATH
```

## Pre Creation Hook Examples

### 1. Validate branch naming convention

```bash
#!/bin/bash
# Ensure branch name follows convention: feature/, bugfix/, hotfix/
if [[ ! "$CCMANAGER_WORKTREE_BRANCH" =~ ^(feature|bugfix|hotfix)/ ]]; then
    echo "Error: Branch name must start with feature/, bugfix/, or hotfix/" >&2
    exit 1
fi
```

### 2. Check disk space before creating worktree

```bash
#!/bin/bash
# Ensure at least 1GB free disk space
FREE_KB=$(df "$CCMANAGER_GIT_ROOT" | tail -1 | awk '{print $4}')
MIN_KB=1048576  # 1GB in KB

if [ "$FREE_KB" -lt "$MIN_KB" ]; then
    echo "Error: Insufficient disk space. Need at least 1GB free." >&2
    exit 1
fi
```

### 3. Prevent duplicate worktrees for same branch

```bash
#!/bin/bash
# Check if a worktree for this branch already exists
EXISTING=$(git worktree list | grep "\[$CCMANAGER_WORKTREE_BRANCH\]")
if [ -n "$EXISTING" ]; then
    echo "Error: Worktree for branch '$CCMANAGER_WORKTREE_BRANCH' already exists" >&2
    exit 1
fi
```

### 4. Verify CI status of base branch

```bash
#!/bin/bash
# Check if base branch CI is passing (requires gh CLI)
if [ -n "$CCMANAGER_BASE_BRANCH" ]; then
    STATUS=$(gh run list --branch "$CCMANAGER_BASE_BRANCH" --limit 1 --json conclusion -q '.[0].conclusion')
    if [ "$STATUS" != "success" ]; then
        echo "Warning: Base branch CI status is '$STATUS'" >&2
        # Use exit 1 to block, or continue with warning
    fi
fi
```