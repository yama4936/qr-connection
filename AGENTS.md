<!-- BEGIN:nextjs-agent-rules -->
# これはあなたが知っている通常の Next.js ではありません

このプロジェクトで使用されている Next.js は、既存知識とは異なる破壊的変更を含んでいる可能性があります。  
API、規約、ディレクトリ構成などが、学習済みの一般的な Next.js と異なる場合があります。

Next.js のコードを書いたり修正したりする前に、必ず以下のドキュメントを確認してください。

`node_modules/next/dist/docs/`

このプロジェクト内のドキュメントを、一般的な知識より優先してください。

非推奨（deprecated）警告を確認し、古い API や古い書き方を使用しないでください。

---

# ブランチ運用ルール

作業を始める前に、必ず `master` ブランチ（または最新のデフォルトブランチ）から新しい作業ブランチを作成してください。

直接 `master` へコミットしてはいけません。

## ブランチ作成例

```bash
git checkout master
git pull
git checkout -b feature/qr-send-ui
```

## ブランチ名ルール

ブランチ名は、作業内容が分かるようにしてください。

例:
- `feature/qr-send-ui`
- `feature/qr-receiver`
- `feature/chunk-parser`
- `fix/checksum-validation`
- `refactor/payload-utils`

# Git コミットルール

各機能、または論理的な実装単位ごとに Git コミットを作成してください。

無関係な複数機能を、1つのコミットにまとめてはいけません。

## コミット単位の例

- プロジェクト初期構成
- QR payload 型定義追加
- base64 utility 追加
- 圧縮 utility 追加
- chunk split/join utility 追加
- checksum utility 追加
- 送信ページ UI 実装
- QR生成処理実装
- QR自動再生ループ実装
- 受信ページ UI 実装
- QR scanner 実装
- chunk収集ロジック実装
- payload復元ロジック実装
- バリデーションとエラーハンドリング追加
- UI調整

## コミットメッセージ例

```bash
git add .
git commit -m "プロジェクト構成を初期化"
git add .
git commit -m "QR payload 型定義を追加"
git add .
git commit -m "base64 ユーティリティを追加"
git add .
git commit -m "圧縮ユーティリティを実装"
git add .
git commit -m "chunk 分割・結合処理を追加"
git add .
git commit -m "チェックサム処理を追加"
git add .
git commit -m "QRコード送信画面を実装"
git add .
git commit -m "QRコード生成処理を実装"
git add .
git commit -m "QRコード自動再生ループを実装"
git add .
git commit -m "QRコード受信画面を実装"
git add .
git commit -m "QRスキャナーを実装"
git add .
git commit -m "chunk 収集ロジックを実装"
git add .
git commit -m "payload 復元処理を実装"
git add .
git commit -m "バリデーションとエラーハンドリングを追加"
git add .
git commit -m "UI を調整"
```

# コミット前チェック

コミット前には、可能な限り以下を実行してください。

```bash
npm run lint
npm run build
```

もしチェックが失敗した場合は、修正してからコミットしてください。

プロジェクトにそのコマンドが存在しない場合は、作業ログや報告でその旨を説明してください。

# コミット前の確認ルール

毎回コミット前に、必ず以下を確認してください。

```bash
git status --short
git diff --cached --stat
```

不要なファイルが含まれていないことを確認してください。

# Git push ルール

ユーザーから明示的に指示されるまで、`git push` を実行してはいけません。

ローカルコミットは許可されており、むしろ必須ですが、リモートへの push は禁止です。

# ドキュメントファイルの扱い

以下のようなドキュメント専用ファイルについては、実装に直接必要でない限り、作成・変更・ステージング・コミットを行わないでください。

対象例:
- `docs/**`
- `*.md`
- `README.md`
- `CHANGELOG.md`
- `LICENSE`
- 説明資料
- 設計メモ
- 自動生成レポート
- スキル説明ファイル

ユーザーが明示的に要求した場合のみ変更可能です。

<!-- END:nextjs-agent-rules -->
