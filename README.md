# FF14 レシピ素材ツリー 使い方ガイド

「FF14 レシピ素材ツリー」の機能と使い方を、PC・スマートフォンの画面付きで紹介する静的ガイドサイトです。

公開ページ:

```text
https://jogu6.github.io/ffxiv-recipe-about/
```

アプリ本体:

```text
https://jogu6.github.io/ffxiv-recipe/
```

## 主な内容

- アイテム検索と装備条件検索
- レシピツリー、必要素材、制作・購入、刻限採集
- 素材からのレシピ逆引き
- お気に入りリストの作成・整理・個数指定
- 複数のお気に入りリストの素材計算
- シェアコードによる保存・共有
- PWA・小窓表示
- PC・スマートフォン別の操作画像
- Swiperによる画像ギャラリー
- 拡大・縮小、ドラッグ、ピンチ操作に対応した画像ビューアー

## ディレクトリ構成

```text
src/guide/                         ガイドの編集元
  index.html
  assets/
    guide.css
    guide-features.css
    guide.js
    app-icons/
    images/
    vendor/
docs/                              GitHub Pages公開物
tools/
  build-site.mjs                   src/guideからdocsへ反映
  capture-guide.mjs                WebアプリからPC・スマートフォン画像を生成
  serve-site.mjs                   ローカル配信
  validate-site.mjs                公開ファイルと参照の検証
tests/
  app.spec.js                      Playwright E2Eテスト
  guide.spec.js                    ガイド専用レスポンシブE2Eテスト
archive/discord-site-generator/    旧Discord静的サイト生成技術
```

ガイド本文・CSS・JavaScript・画像は、すべて `src/guide/` が正本です。`docs/index.html` と `docs/assets/` を直接編集せず、ビルド処理で反映します。

## セットアップ

```powershell
npm install
```

## ビルド

```powershell
npm run build
```

この処理は次を更新します。

- `docs/index.html`
- `docs/assets/`

`docs/robots.txt`、`docs/sitemap.xml`、Google所有権確認ファイルは維持されます。

## ガイド画像の生成

同じ親ディレクトリに `ffxiv-recipe` がある状態で実行します。

```powershell
npm run capture:guide
```

PC・スマートフォン画像は `src/guide/assets/images/` へ直接生成されます。確認用PNGはGit管理外の `guide-capture-output/` に保存されます。画像生成後は `npm run build` で公開物へ反映します。

## ローカル確認

```powershell
npm run dev
```

ブラウザーで次を開きます。

```text
http://127.0.0.1:4174/
```

## 検証

構文、必須メタ情報、参照ファイル、生成元と公開物の一致を確認します。

```powershell
npm run check
```

ChromiumでPC・600px幅、目次、ギャラリー、画像ビューアー、LICENSE、Topボタン、404とJavaScriptエラーを確認します。

```powershell
npm run test:e2e
```

## 公開

GitHub Pagesは `main` ブランチの `docs/` を公開元にします。

```text
Settings > Pages > Build and deployment
Deploy from a branch
Branch: main
Folder: /docs
```

## 旧Discord生成技術

以前使用していた、Discordの投稿本文と添付画像から静的サイトを生成するPowerShellツールは、次へ保存しています。

```text
archive/discord-site-generator/
```

利用方法と秘密設定の注意事項は、同ディレクトリのREADMEを参照してください。このアーカイブは現在のガイド公開処理から独立しています。

## Webアプリとの関係

ガイドの正本と公開物はこのリポジトリだけで管理します。別リポジトリの `ffxiv-recipe` は、ガイド画像を生成する際の表示対象となるWebアプリです。
