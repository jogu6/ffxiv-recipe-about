const { expect, test } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
});

test("目次は確定した12章を順番どおり表示する", async ({ page }) => {
  await expect(page.locator("#toc-list > li > a")).toHaveText([
    "このアプリでできること",
    "基本的な使い方",
    "装備を条件検索する",
    "製作方法と素材を調整する",
    "お気に入りリストを使う",
    "お気に入りの製作条件を指定する",
    "複数のお気に入りをまとめて計算する",
    "表示内容を共有する",
    "お気に入りを保存・共有する",
    "画面表示と操作を設定する",
    "データの保存とアプリの更新",
    "注意事項・権利表記",
  ]);
});

test("目次の小項目は本文の固有見出しへ移動する", async ({ page }) => {
  const nestedLinks = page.locator("#toc-list > li > ol a");
  await expect(nestedLinks).toHaveCount(47);
  const targets = await nestedLinks.evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(new Set(targets).size).toBe(targets.length);
  for (const target of targets) {
    await expect(page.locator(target)).toHaveCount(1);
  }
});

test("すべての撮影系列は操作前から操作結果までを明示する", async ({ page }) => {
  const invalid = await page.evaluate(() =>
    Object.entries(window.GUIDE_SLIDES).flatMap(([gallery, variants]) =>
      Object.entries(variants).flatMap(([layout, slides]) => {
        if (!slides.length) return [];
        const first = slides[0][2];
        const last = slides.at(-1)[2];
        return first.startsWith("操作前：") && last.startsWith("操作結果：")
          ? []
          : [{ gallery, layout, first, last }];
      }),
    ),
  );
  expect(invalid).toEqual([]);
});

test("画面幅に応じてデスクトップ版とモバイル版だけを表示する", async ({ page }) => {
  const sources = () => page.locator(".image-grid img").evaluateAll((images) =>
    images.map((image) => new URL(image.src).pathname),
  );

  await expect.poll(async () => (await sources()).every((src) => /\/mobile-/.test(src))).toBe(true);
  await page.setViewportSize({ width: 601, height: 844 });
  await expect.poll(async () => (await sources()).every((src) => /\/desktop-/.test(src))).toBe(true);
});

test("共有テキストと共有画像の実出力を結果画像として掲載する", async ({ page }) => {
  const share = page.locator("#content-share");
  await expect(share).toContainText("撮影時にアプリが実際に出力したテキスト");
  await expect(share).toContainText("撮影時にアプリが実際に出力した画像");
  await expect(share.getByRole("img", { name: /生成された共有テキスト/ })).toBeAttached();
  await expect(share.getByRole("img", { name: /生成された共有画像/ })).toBeAttached();
});

test("シェアコードとファイル操作は発行・取り込みを分けて説明する", async ({ page }) => {
  const section = page.locator("#favorite-share");
  await expect(section.locator("#share-code-create + p")).toContainText("コードをコピー");
  await expect(section.locator("#share-code-import + p")).toContainText("取り込む");
  await expect(section.locator('[data-gallery="shareCodeCreate"]')).toBeAttached();
  await expect(section.locator('[data-gallery="shareCodeImport"]')).toBeAttached();
  await expect(section.locator('[data-gallery="favoriteFileExport"]')).toBeAttached();
  await expect(section.locator('[data-gallery="favoriteFileImport"]')).toBeAttached();
});

test("対応環境と保存・更新の前提を具体的に説明する", async ({ page }) => {
  const overview = page.locator("#overview");
  await expect(overview).toContainText("Google Chrome 93以降");
  await expect(overview).toContainText("Microsoft Edge 93以降");
  await expect(overview).toContainText("Safari 16.4以降");
  await expect(overview).toContainText("Brave 1.29以降");
  await expect(overview).toContainText("WebP");
  await expect(overview).toContainText("エオルゼアデータベース");
  await expect(overview).toContainText("iPhone・iPadでホーム画面へ追加する場合はSafari");
  await expect(page.locator("#data-update")).toContainText("別ブラウザーや別端末へは自動同期されません");
  await expect(page.locator("#data-migration").locator("xpath=following-sibling::p[1]")).toContainText("お気に入りリスト等が全て削除されます");
  await expect(page.locator("#notes")).toContainText("製作レシピがあるアイテム");
});
