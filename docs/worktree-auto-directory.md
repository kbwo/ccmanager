# Automatic Worktree Directory Generation

CCManager can automatically generate worktree directory paths based on branch names, eliminating the need to manually specify directories when creating new worktrees.

## How It Works

When enabled, the automatic directory generation feature:
1. Takes the branch name you enter
2. Applies a configurable pattern to generate the directory path
3. Sanitizes the branch name for filesystem compatibility
4. Shows a live preview of the generated path

This streamlines the worktree creation process, especially for teams with consistent directory naming conventions.

## Enabling Auto-Generation

### Via UI

1. Navigate to **Configuration** → **Configure Worktree Settings**
2. Enable "Auto-generate directory from branch name"
3. Customize the pattern (default: `../{branch}`)
4. Save changes

### Via Configuration File

Edit `~/.config/ccmanager/config.json`:

```json
{
  "worktree": {
    "autoDirectory": true,
    "autoDirectoryPattern": "../{branch}"
  }
}
```

## Pattern Syntax

The pattern supports the following placeholders:
- `{branch}` or `{branch-name}`: Replaced with the sanitized branch name

## Branch Name Sanitization

Branch names are automatically sanitized for filesystem compatibility:

1. **Slash Conversion**: Forward slashes (`/`) are replaced with dashes (`-`)
   - `feature/login` → `feature-login`
   - `bugfix/issue-123` → `bugfix-issue-123`

2. **Special Character Removal**: Only keeps:
   - Letters (a-z, A-Z)
   - Numbers (0-9)
   - Dash (`-`)
   - Dot (`.`)
   - Underscore (`_`)

3. **Case Normalization**: Converted to lowercase for consistency
   - `Feature/Login` → `feature-login`

4. **Cleanup**: Leading and trailing dashes are removed
   - `-feature-` → `feature`

## Pattern Examples

| Pattern | Branch Name | Generated Directory |
|---------|-------------|-------------------|
| `../{branch}` | `feature/login` | `../feature-login` |
| `.git/tasks/{branch}` | `fix/bug-123` | `.git/tasks/fix-bug-123` |
| `worktrees/{branch}` | `hotfix/v1.2.3` | `worktrees/hotfix-v1.2.3` |
| `~/work/{branch}` | `feature/new-ui` | `~/work/feature-new-ui` |
| `../{branch}-wt` | `develop` | `../develop-wt` |

## User Experience

### When Disabled (Default)
- Users see two input fields: Directory and Branch Name
- Must manually enter both values
- Full control over directory naming

### When Enabled
- Users see only the Branch Name field
- Directory path is automatically generated and displayed
- Live preview updates as you type
- Generated path is shown in dim text below the input

## Best Practices

1. **Consistent Patterns**: Use patterns that match your team's conventions
2. **Relative Paths**: Using `../` keeps worktrees at the same level as your main repository
3. **Descriptive Suffixes**: Consider patterns like `{branch}-wt` to clearly identify worktrees
4. **Special Directories**: Use `.git/tasks/{branch}` to keep worktrees organized within the repository

## Common Use Cases

### Feature Development
Pattern: `../feature/{branch}`
- Creates a dedicated feature directory
- Groups all feature branches together

### Task-Based Work
Pattern: `.git/tasks/{branch}`
- Keeps worktrees within the repository structure
- Hidden from normal directory listings
- Easy to clean up

### Parallel Development
Pattern: `../{branch}-dev`
- Clear indication of development worktrees
- Avoids conflicts with existing directories

## Troubleshooting

### Directory Already Exists
If the generated directory already exists, CCManager will show an error. You can:
- Choose a different branch name
- Modify the pattern to include unique elements
- Manually specify a different directory (temporarily disable auto-generation)

### Invalid Characters
If your branch name contains many special characters, the sanitized version might be very different. Check the preview to ensure the generated path meets your expectations.

### Path Resolution
Patterns are resolved relative to the current repository root. Ensure your pattern creates directories in accessible locations.