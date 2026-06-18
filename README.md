# FFXIV Recipe About

Discord の特定チャンネルからテキストと画像を取得し、GitHub Pages 用の静的 HTML を生成する手動実行型ツールです。

## Setup

1. `src/config.example.json` を `config.local.json` にコピーします。
2. `config.local.json` に Discord bot token、対象サーバー ID、対象チャンネル ID を設定します。
3. PowerShell で生成スクリプトを実行します。

```powershell
.\scripts\export-discord.ps1
```

設定ファイルの場所を変える場合だけ `-Config` を指定します。

```powershell
.\scripts\export-discord.ps1 -Config .\path\to\config.json
```

## Output

生成先は既定で `docs/` です。

```text
docs/
  index.html
  channels/
    recipe.html
  assets/
    styles.css
    images/
```

GitHub Pages は `main` ブランチの `docs/` を公開元にしてください。

## Notes

- 投稿日時と投稿者名は出力しません。
- Discord の画像は `docs/assets/images/` に保存します。
- 動作テストでは commit/push しません。
- `config.local.json` は bot token を含むため Git 管理しません。
