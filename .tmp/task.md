# Worktree作成後の自動セッション開始 - タスクリスト

## タスク

- [x] WorktreeServiceのcreateWorktreeメソッドの戻り値を確認
- [x] handleCreateWorktree関数を修正して自動セッション開始を実装
- [ ] 既存のテストを確認し、影響を受けるテストがあれば修正
- [ ] 手動で動作確認
- [ ] コミット準備

## 詳細タスク

### 1. WorktreeServiceの戻り値確認
- [x] worktreeService.tsを確認して、createWorktreeの戻り値の型を確認
- [x] 作成されたworktreeのpath情報が取得できるか確認（引数として渡されたpathを使用）

### 2. handleCreateWorktree関数の修正
- [x] worktree作成成功時の処理を変更
- [x] sessionを作成
- [x] activeSessionを設定
- [x] viewを'session'に変更

### 3. テスト確認
- [x] 既存のテストを実行
- [x] 影響を受けるテストがあれば修正（影響なし）

### 4. 動作確認
- [ ] worktreeを作成してセッションが自動開始されることを確認
- [ ] エラーケースも確認