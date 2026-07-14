# Discord静的サイト生成ツール（アーカイブ）

Discordの特定チャンネルから投稿本文と添付画像を取得し、静的HTMLサイトを生成するための技術資料です。現在の「FF14 レシピ素材ツリー 使い方ガイド」とは独立した保存物です。

## 構成

```text
config.example.json      設定テンプレート
tools/
  export-discord.ps1     Discord取得・静的サイト生成スクリプト
src/
  site-template.html     HTMLテンプレート
  styles.css             公開CSSの生成元
  app.js                 公開JavaScriptの生成元
  license-notice.md      LICENSE表示内容
  assets/app-icons/      favicon
```

実行時には、このディレクトリ直下に次のローカルファイル・ディレクトリが作成または使用されます。

```text
config.local.json        Botトークンなどのローカル設定
data/cache/              Discord取得結果のキャッシュ
docs/                    生成される静的サイト
```

## 設定

`config.example.json` を `config.local.json` にコピーし、Discord Botトークン、サーバーID、チャンネルIDなどを設定します。

`config.local.json` には秘密情報が含まれるため、Gitへ追加しないでください。流用先でも必ず `.gitignore` に登録してください。

## 実行

PowerShellでこのディレクトリへ移動し、次を実行します。

```powershell
.\tools\export-discord.ps1
```

保存済みキャッシュだけから再生成する場合:

```powershell
.\tools\export-discord.ps1 -NoFetch
```

別の設定ファイルを使う場合:

```powershell
.\tools\export-discord.ps1 -Config .\path\to\config.json
```

このアーカイブは技術流用のために保存しています。現在のリポジトリ公開物を直接生成する用途ではありません。
