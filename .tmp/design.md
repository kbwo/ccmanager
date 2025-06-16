# Worktree作成後の自動セッション開始機能

## 問題

現在、新しいworktreeを作成した後、メニューに戻ってしまい、ユーザーは手動で作成したworktreeを選択してセッションを開始する必要がある。

## 要件

1. worktreeを作成したら自動的にそのworktreeのClaude Codeセッションを開始する
2. エラーが発生した場合は、エラーメッセージを表示して新規作成画面に戻る
3. 既存の機能に影響を与えない

## 設計

### 変更箇所

`App.tsx`の`handleCreateWorktree`関数を修正：

1. worktree作成が成功したら、作成したworktreeのpathを使用してセッションを作成
2. `handleSelectWorktree`と同じロジックを使用してセッションを開始
3. viewを'session'に変更

### 実装方針

1. worktree作成成功後に、作成したworktreeの情報を取得
2. `sessionManager.createSession()`でセッションを作成
3. `setActiveSession()`でアクティブセッションを設定
4. `setView('session')`でセッションビューに切り替え

### 考慮事項

- worktreeのpathは`result`オブジェクトから取得する必要がある可能性がある
- エラーハンドリングは既存のまま維持