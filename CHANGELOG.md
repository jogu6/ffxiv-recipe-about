# Changelog

## v2.0.0

- Discord 投稿ベースの紹介ページから、画面付きの使い方ガイドへ全面移行
- PC・モバイル表示用のガイド画像を追加
- Swiper によるレスポンシブ画像ギャラリーを追加
- 拡大・縮小、ドラッグ、ピンチ操作に対応した画像ビューアーを追加
- canonical、OGP、Twitter Card、JSON-LD をガイド向けに更新
- `src/guide/` から `docs/` を生成するビルド処理を追加
- サイト検証と Playwright E2E テストをガイド仕様へ更新
- 旧 Discord 静的サイト生成技術を `archive/discord-site-generator/` へ保存

## v1.0

- GitHub Pages 公開用の `docs/` 出力を整備
- Discord 投稿のテキストと画像から静的 HTML を生成
- 投稿内 URL の自動リンク化を追加
- 複数画像ギャラリー、ドット移動、横スクロール操作を追加
- 縮小表示時のみ虫眼鏡ボタンを出す原寸画像ビューアーを追加
- `FF14レシピ素材ツールを開く` ボタンを追加
- LICENSE / NOTICE オーバーレイを追加
- footer 権利表記を追加
- favicon を追加
- SEO 用 meta、canonical、OGP、JSON-LD、`robots.txt`、`sitemap.xml` を追加
- ローカル配信、サイト検証、Playwright E2E を追加
