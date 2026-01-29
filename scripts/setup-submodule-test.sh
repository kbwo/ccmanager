#!/bin/bash

# Script to reproduce GitHub issue #189
# Creates a project structure with submodules to test CCManager's project recognition
#
# Usage: ./setup-submodule-test.sh <parent-directory>
# Example: ./setup-submodule-test.sh /tmp/ccmanager-test

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <parent-directory>"
    echo "Example: $0 /tmp/ccmanager-test"
    exit 1
fi

PARENT_DIR="$1"
ROOT_PROJECT="$PARENT_DIR/root-project"

# Clean up if exists
if [ -d "$PARENT_DIR" ]; then
    echo "Removing existing directory: $PARENT_DIR"
    rm -rf "$PARENT_DIR"
fi

echo "Creating test directory structure at: $PARENT_DIR"

# Create parent directory
mkdir -p "$PARENT_DIR"

# Create submodule repositories (these will be added as submodules)
echo "Creating submodule source repositories..."

# Create submodule-1 source repo
mkdir -p "$PARENT_DIR/submodule-1-source"
cd "$PARENT_DIR/submodule-1-source"
git init
echo "# Submodule 1" > README.md
git add README.md
git commit -m "Initial commit for submodule-1"

# Create submodule-2 source repo
mkdir -p "$PARENT_DIR/submodule-2-source"
cd "$PARENT_DIR/submodule-2-source"
git init
echo "# Submodule 2" > README.md
git add README.md
git commit -m "Initial commit for submodule-2"

# Create root project
echo "Creating root project..."
mkdir -p "$ROOT_PROJECT"
cd "$ROOT_PROJECT"
git init
echo "# Root Project" > README.md
git add README.md
git commit -m "Initial commit for root-project"

# Create modules directory and add submodules
echo "Adding submodules to modules/ directory..."
mkdir -p modules

# Add submodules
git submodule add "$PARENT_DIR/submodule-1-source" modules/submodule-1
git submodule add "$PARENT_DIR/submodule-2-source" modules/submodule-2
git commit -m "Add submodules"

echo ""
echo "======================================"
echo "Test environment created successfully!"
echo "======================================"
echo ""
echo "Directory structure:"
echo "$PARENT_DIR/"
echo "├── submodule-1-source/  (source repo for submodule-1)"
echo "├── submodule-2-source/  (source repo for submodule-2)"
echo "└── root-project/"
echo "    └── modules/"
echo "        ├── submodule-1/  (git submodule)"
echo "        └── submodule-2/  (git submodule)"
echo ""
echo "To reproduce issue #189:"
echo "  cd $ROOT_PROJECT/modules/submodule-1"
echo "  npx ccmanager"
echo ""
echo "Expected: Project should be recognized as 'submodule-1'"
echo "Actual (bug): Project is recognized as 'modules'"
