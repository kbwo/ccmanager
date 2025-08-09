# Worktree Hooks

CCManager supports executing custom hooks when worktrees are created, allowing you to automate tasks like setting up development environments, creating configuration files, or sending notifications.

## Configuration

Worktree hooks are configured in the CCManager configuration file (`~/.config/ccmanager/config.json`). You can configure them through the UI or by editing the configuration file directly.

### Available Hooks

#### Post-Creation Hook

The `post_creation` hook is executed after a new worktree is successfully created.

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

## Execution Context

By default, hooks are executed in the newly created worktree directory. This means your commands will run with the worktree path as the current working directory.

If you need to execute commands in the git root directory instead, you can use the `CCMANAGER_GIT_ROOT` environment variable:

```bash
cd "$CCMANAGER_GIT_ROOT" && your-command-here
```

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