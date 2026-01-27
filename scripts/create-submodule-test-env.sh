#!/bin/bash
#
# Issue #189 再現用スクリプト
# サブモジュールを含むGitリポジトリ構造を作成します
#
# 使用方法:
#   ./scripts/create-submodule-test-env.sh /path/to/parent/dir
#
# 作成される構造:
#   <parent_dir>/
#   ├── submodule-1-repo/     # submodule-1 のベアリポジトリ
#   ├── submodule-2-repo/     # submodule-2 のベアリポジトリ
#   └── root-project/         # メインプロジェクト
#       ├── README.md
#       └── modules/
#           ├── submodule-1/  # ← ここでccmanagerを実行してテスト
#           └── submodule-2/
#

set -e

# 引数チェック
if [ -z "$1" ]; then
    echo "使用方法: $0 <親ディレクトリのパス>"
    echo ""
    echo "例: $0 /tmp/ccmanager-issue-189-test"
    exit 1
fi

PARENT_DIR="$1"

# ディレクトリが既に存在する場合は確認
if [ -d "$PARENT_DIR" ]; then
    echo "警告: $PARENT_DIR は既に存在します"
    read -p "削除して再作成しますか? (y/N): " confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        rm -rf "$PARENT_DIR"
    else
        echo "中止しました"
        exit 1
    fi
fi

echo "=== Issue #189 再現環境を作成中 ==="
echo "親ディレクトリ: $PARENT_DIR"
echo ""

# 親ディレクトリ作成
mkdir -p "$PARENT_DIR"

# サブモジュール1のソースリポジトリを作成
SUBMODULE1_REPO="$PARENT_DIR/submodule-1-repo"
echo "[1/5] submodule-1 のソースリポジトリを作成..."
mkdir -p "$SUBMODULE1_REPO"
cd "$SUBMODULE1_REPO"
git init
git config user.email "test@example.com"
git config user.name "Test User"
echo "# Submodule 1" > README.md
echo "This is submodule-1 content." >> README.md
git add .
git commit -m "Initial commit for submodule-1"

# サブモジュール2のソースリポジトリを作成
SUBMODULE2_REPO="$PARENT_DIR/submodule-2-repo"
echo "[2/5] submodule-2 のソースリポジトリを作成..."
mkdir -p "$SUBMODULE2_REPO"
cd "$SUBMODULE2_REPO"
git init
git config user.email "test@example.com"
git config user.name "Test User"
echo "# Submodule 2" > README.md
echo "This is submodule-2 content." >> README.md
git add .
git commit -m "Initial commit for submodule-2"

# ルートプロジェクトを作成
ROOT_PROJECT="$PARENT_DIR/root-project"
echo "[3/5] root-project を作成..."
mkdir -p "$ROOT_PROJECT"
cd "$ROOT_PROJECT"
git init
git config user.email "test@example.com"
git config user.name "Test User"
echo "# Root Project" > README.md
echo "This is the main project with submodules." >> README.md
git add .
git commit -m "Initial commit for root-project"

# サブモジュールを追加
echo "[4/5] サブモジュールを追加..."
mkdir -p modules
git submodule add "$SUBMODULE1_REPO" modules/submodule-1
git submodule add "$SUBMODULE2_REPO" modules/submodule-2
git commit -m "Add submodules"

echo "[5/5] 完了!"
echo ""
echo "=== 作成された構造 ==="
echo "$PARENT_DIR/"
echo "├── submodule-1-repo/     # submodule-1 のソースリポジトリ"
echo "├── submodule-2-repo/     # submodule-2 のソースリポジトリ"
echo "└── root-project/         # メインプロジェクト"
echo "    ├── README.md"
echo "    └── modules/"
echo "        ├── submodule-1/  # ← テスト対象"
echo "        └── submodule-2/"
echo ""
echo "=== テスト方法 ==="
echo ""
echo "1. サブモジュールディレクトリに移動:"
echo "   cd $ROOT_PROJECT/modules/submodule-1"
echo ""
echo "2. CCManagerを実行:"
echo "   npx ccmanager"
echo ""
echo "3. 確認ポイント:"
echo "   - 修正前: プロジェクト名が 'modules' と表示される (バグ)"
echo "   - 修正後: プロジェクト名が 'submodule-1' と表示される (正常)"
echo ""
