# FF14レシピ素材ツリー とは？

Discord の特定チャンネルからテキストと画像を取得し、GitHub Pages 用の静的 HTML を生成する手動実行型ツールです。

公開ページ:

```text
https://jogu6.github.io/ffxiv-recipe-about/
```

## 概要

- PowerShell スクリプトを実行した時だけ Discord から取得します。常駐型 bot ではありません。
- 投稿本文と画像のみを出力します。投稿日時と投稿者名は出力しません。
- 画像は `docs/assets/images/` にローカル保存します。
- 生成先は GitHub Pages 公開用の `docs/` です。
- PC と 600px 以下のスマホ幅で見やすいレイアウトを生成します。
- LICENSE 表示、検索向けメタ情報、`robots.txt`、`sitemap.xml` も生成します。

## セットアップ

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

Discord から再取得せず、保存済みキャッシュから HTML を再生成する場合は `-NoFetch` を指定します。

```powershell
.\tools\export-discord.ps1 -NoFetch
```

## 設定

`config.example.json`:

```json
{
  "siteTitle": "FF14レシピ素材ツリー とは？",
  "siteDescription": "FF14レシピ素材ツリーの概要、使い方、スマホ対応、素材ツリー表示やお気に入りリスト機能を紹介します。",
  "siteUrl": "https://jogu6.github.io/ffxiv-recipe-about/",
  "botToken": "DISCORD_BOT_TOKEN",
  "guildId": "SERVER_ID",
  "channelId": "CHANNEL_ID",
  "channelTitle": "レシピ素材ツリー",
  "outputDir": "docs",
  "downloadImages": true,
  "maxMessages": 100
}
```

`config.local.json` は bot token を含むため Git 管理しません。

## ディレクトリ構成

```text
config.example.json      # Git管理する設定テンプレート
config.local.json        # ローカル専用設定。Git管理しない
src/                     # HTML生成元
  site-template.html     # ページテンプレート
  styles.css             # 公開CSSの生成元
  app.js                 # 公開JSの生成元
  license-notice.md      # LICENSE表示用Markdown
  assets/app-icons/      # faviconなど
tools/                   # 生成、ローカル配信、検証ツール
  export-discord.ps1
  serve-site.mjs
  validate-site.mjs
tests/                   # Playwright E2E
  app.spec.js
docs/                    # GitHub Pages公開対象
  index.html
  robots.txt
  sitemap.xml
  assets/
data/cache/              # Discord取得結果キャッシュ。Git管理しない
```

## 生成される主な機能

- Discord 投稿本文内 URL の自動リンク化
- 複数画像投稿の横スクロールギャラリー
- ドットクリックによる任意画像への移動
- 画像が縮小表示される場合だけ虫眼鏡ボタンを表示
- 原寸画像ビューアー
- Top ボタン
- `FF14レシピ素材ツールを開く` ボタン
- LICENSE / NOTICE オーバーレイ
- footer 権利表記
- SEO 用 meta / canonical / OGP / JSON-LD
- `robots.txt` / `sitemap.xml`

## 開発・確認

依存関係を入れます。

```powershell
npm install
```

ローカル確認:

```powershell
npm run dev
```

開く URL:

```text
http://127.0.0.1:4173
```

検証:

```powershell
npm run check
npm run test:e2e
```

- `npm run dev`: `docs/` を `http://127.0.0.1:4173/` で配信します。
- `npm run check`: JS構文、公開ファイル、SEOファイル、favicon、画像参照、PowerShellのUTF-8 BOMなどを検証します。
- `npm run test:e2e`: PlaywrightでPC/600px幅、ギャラリー、画像ビューア、LICENSE、Topボタンを確認します。

## 公開

GitHub Pages は `main` ブランチの `docs/` を公開元にします。

```text
Settings > Pages > Build and deployment > Deploy from a branch
Branch: main
Folder: /docs
```

## 運用メモ

- Discord からの再取得は必要時だけ行います。
- HTML、CSS、JS、SEOファイルだけ再生成する場合は `-NoFetch` を使います。
- `tools/export-discord.ps1` は UTF-8 BOM + CRLF を維持します。
- 動作テストだけのためにコミット/プッシュはしません。
