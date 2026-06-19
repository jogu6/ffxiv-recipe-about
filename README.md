# FF14レシピ素材ツリー とは？

Discord の特定チャンネルからテキストと画像を取得し、GitHub Pages 用の静的 HTML を生成する手動実行型ツールです。

## クイックスタート

1. `config.example.json` を `config.local.json` にコピーします。
2. `config.local.json` に Discord bot token、対象サーバー ID、対象チャンネル ID を設定します。
3. PowerShell で生成します。

```powershell
.\tools\export-discord.ps1
```

設定ファイルの場所を変える場合だけ `-Config` を指定します。

```powershell
.\tools\export-discord.ps1 -Config .\path\to\config.json
```

Discord から再取得せず、保存済みキャッシュから `docs/index.html` を再生成する場合は `-NoFetch` を指定します。

```powershell
.\tools\export-discord.ps1 -NoFetch
```

## ディレクトリ構成

```text
config.example.json      # Git管理する設定テンプレート
config.local.json        # ローカル専用設定。Git管理しない
src/                     # HTML生成元のテンプレート、CSS、JS、favicon
  site-template.html
  styles.css
  app.js
  assets/app-icons/
tools/                   # 生成、ローカル配信、検証ツール
  export-discord.ps1
  serve-site.mjs
  validate-site.mjs
tests/                   # Playwright E2E
  app.spec.js
docs/                    # GitHub Pages公開対象
  index.html
  assets/
data/cache/              # Discord取得結果キャッシュ。Git管理しない
```

## 公開

GitHub Pages は `main` ブランチの `docs/` を公開元にしてください。

```text
https://jogu6.github.io/ffxiv-recipe-about/
```

## 開発・確認


参考リポジトリ `ffxiv-recipe` と同じく、npm scripts で確認します。

```powershell
npm install
npm run dev
npm run check
npm run test:e2e
```

- `npm run dev`: `docs/` を `http://127.0.0.1:4173/` で配信します。
- `npm run check`: JS構文、公開ファイル、favicon、画像参照、PowerShellのUTF-8 BOMなどを検証します。
- `npm run test:e2e`: PlaywrightでPC/600px幅、ギャラリー、画像ビューア、Topボタンを確認します。

## 注意

- 投稿日時と投稿者名は出力しません。
- Discord の画像は `docs/assets/images/` に保存します。
- `config.local.json` は bot token を含むため Git 管理しません。
- Discord からの再取得は必要時だけ行います。HTML生成だけでよい場合は `-NoFetch` を使います。


