# 「FF14レシピ素材ツリー とは？」紹介ページ生成

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
- 投稿カードは最も広い投稿に幅をそろえ、ページ上部のタイトル/ボタンも同じ幅にします。
- 画像はアスペクト比を維持したまま、投稿全体が表示領域の縦幅に収まるよう縮小します。
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
  "siteMetaTitle": "FF14レシピ素材ツリーとは？ 素材検索・レシピ逆引き・制作支援ツール紹介",
  "siteDescription": "FF14 / Final Fantasy XIV Online / FFXIV のクラフター制作に必要な素材を、レシピツリー、素材リスト、逆引き、お気に入り共有で確認できるWebツール「FF14レシピ素材ツリー」の紹介ページです。スマホにも対応しています。",
  "siteKeywords": [
    "FF14",
    "Final Fantasy XIV Online",
    "Final Fantasy XIV",
    "FFXIV",
    "レシピ",
    "素材",
    "素材ツリー",
    "レシピ検索",
    "素材検索",
    "クラフター",
    "ギャザラー",
    "制作",
    "中間素材",
    "逆引き",
    "お気に入り共有",
    "スマホ対応"
  ],
  "siteUrl": "https://jogu6.github.io/ffxiv-recipe-about/",
  "botToken": "DISCORD_BOT_TOKEN",
  "guildId": "SERVER_ID",
  "channelId": "CHANNEL_ID",
  "channelLabels": {
    "1516701219828138054": "シェアコード広場"
  },
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
- 同一サーバー内 Discord チャンネル URL のチャンネル名表示
- 複数画像投稿の横スクロールギャラリー
- 複数画像投稿の `<` / `>` ボタン移動と、1枚ずつのフリック移動
- ドットクリックによる任意画像への移動
- 複数画像投稿で画像を切り替えてもページ縦位置がずれない高さ固定
- 投稿カード、ページ上部タイトル、アプリ起動ボタンの幅統一
- 表示領域に収まる画像縮小とアスペクト比維持
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
py -m http.server 4173 --bind 0.0.0.0 --directory docs
```

PC で開く URL:

```text
http://127.0.0.1:4173
```

スマホ実機で確認する場合は、PC とスマホを同じ LAN に接続し、PC の IPv4 アドレスを確認します。

```powershell
ipconfig
```

スマホで次の形式の URL を開きます。

```text
http://192.168.11.2:4173
```

`192.168.11.2` は PC の IPv4 アドレスに置き換えます。

検証:

```powershell
node --check docs\assets\app.js
node --check src\app.js
node --check tools\serve-site.mjs
node --check tools\validate-site.mjs
node tools\validate-site.mjs
.\node_modules\.bin\playwright.cmd test
```

- `node tools\validate-site.mjs`: 公開ファイル、SEOファイル、favicon、画像参照、PowerShell の UTF-8 BOM などを検証します。
- `.\node_modules\.bin\playwright.cmd test`: Playwright で PC/600px 幅、ギャラリー、画像ビューア、LICENSE、Top ボタン、幅調整などを確認します。

## 公開

GitHub Pages は `main` ブランチの `docs/` を公開元にします。

```text
Settings > Pages > Build and deployment > Deploy from a branch
Branch: main
Folder: /docs
```

## 運用メモ

- HTML、CSS、JS、SEOファイルだけ再生成する場合は `-NoFetch` を使います。
- `tools/export-discord.ps1` は UTF-8 BOM + CRLF を維持します。
