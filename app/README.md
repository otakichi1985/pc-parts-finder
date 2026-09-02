# PC Parts Finder（アプリ本体）

PC Parts FinderのWindowsデスクトップアプリ本体です。
Tauri 2 + React + TypeScript で構成しています。

## 開発環境

- [VS Code](https://code.vscode.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## コマンド

```bash
npm install          # 依存パッケージの導入
npm run dev          # Web開発サーバー起動（http://localhost:1420）
npm test             # 単体テスト（vitest）
npm run build        # Web向けビルド（TypeScriptチェック込み）
npm run tauri dev    # デスクトップアプリを開発モードで起動
npm run tauri build -- --no-bundle   # 配布用の単体exe生成
npm run build:extension  # ブラウザ拡張（extension/）のビルド
```

## 主なディレクトリ

- `src/` … React画面と共有TypeScript処理
  - `sources/` … 検索対象サイトの定義と商品取得・正規化
  - `recommendation/` … 候補の順位付けと判定
  - `classifier/` … 商品情報の分類
- `src-tauri/` … Rust側（Windowsネイティブ部分）
  - `src/lib.rs` … 非表示WebViewでのサイト取得、ローカル連携
  - `src/update.rs` … GitHubリリースを参照した自動更新

## 関連ドキュメント

- 配布・更新・リリース手順、検証方法などの開発内部ドキュメントは、
  リポジトリには含めずローカルで管理しています（`context/`）。