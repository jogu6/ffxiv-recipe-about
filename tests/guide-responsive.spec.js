const { expect, test } = require("@playwright/test");
const { swipe } = require("./helpers/guide.js");

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
});
test("table of contents toggle works with touch-sized mobile layout", async ({
  page,
}) => {
  const toggle = page.locator(".toc-toggle");
  const list = page.locator(".toc > ol");
  await toggle.click();
  await expect(list).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(list).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
});

test("table of contents follows the guide content without duplicate or backward links", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();

  await expect(page.locator("#toc-list > li > a")).toHaveText([
    "このアプリでできること",
    "アイテムを検索する",
    "装備を条件検索する",
    "レシピツリー画面を確認する",
    "必要素材と個数を確認する",
    "ツリー内の素材を操作する",
    "素材からレシピを逆引きする",
    "お気に入りリストを使う",
    "お気に入りリストの拡張機能",
    "複数のお気に入りリストの素材を計算する",
    "保存・共有する",
    "小窓・PWAで使う",
    "注意事項・その他",
  ]);
  await expect(page.locator(".post .step")).toHaveCount(0);

  const orderedSections = await page
    .locator(".post-list > section")
    .evaluateAll((sections) => sections.map((section) => section.id));
  expect(orderedSections).toEqual([
    "overview",
    "search",
    "equipment",
    "recipe-tree",
    "materials",
    "tree-tools",
    "reverse",
    "favorites",
    "favorite-tools",
    "combined",
    "share",
    "window",
    "notes",
  ]);

  const targets = await page
    .locator("#toc-list a")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(new Set(targets).size).toBe(targets.length);

  const targetPositions = [];
  for (const target of targets) {
    await expect(page.locator(target)).toHaveCount(1);
    await expect(page.locator(target)).toBeVisible();
    targetPositions.push(
      await page.locator(target).evaluate((element) => element.offsetTop),
    );
  }
  expect(targetPositions).toEqual([...targetPositions].sort((a, b) => a - b));
});

test("desktop table of contents fits the viewport and does not clip labels", async ({
  page,
}) => {
  for (const width of [601, 840, 841, 1440, 1920]) {
    await page.setViewportSize({ width, height: 500 });
    await page.reload();
    await page.evaluate(() => document.fonts.ready);

    const toc = page.locator(".toc");
    const tocBox = await toc.boundingBox();
    const footerBox = await page.locator("footer").boundingBox();
    expect(tocBox.y + tocBox.height).toBeLessThanOrEqual(footerBox.y - 8 + 1);
    const clippedLabels = await page.locator("#toc-list a").evaluateAll((links) =>
      links.filter((link) => link.scrollWidth > link.clientWidth + 1).map((link) => link.textContent),
    );
    expect(clippedLabels).toEqual([]);
  }
});

test("top button reacts on hover", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 500 });
  await page.reload();
  await page.evaluate(() => window.scrollTo(0, 600));
  const button = page.locator(".top-button");
  await expect(button).toBeVisible();
  const before = await button.evaluate((element) => getComputedStyle(element).backgroundColor);
  await button.hover();
  await expect(button).toHaveCSS("cursor", "pointer");
  await expect
    .poll(() => button.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(before);
});

test("images switch at 600px without reloading in either direction", async ({
  page,
}) => {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);

  const mobileImages = await page
    .locator(".extension-sections img")
    .evaluateAll((images) =>
      images.map((image) => image.currentSrc || image.src),
    );
  expect(mobileImages).not.toHaveLength(0);
  expect(mobileImages.every((src) => /\/mobile-[^/]+\.webp$/.test(src))).toBe(
    true,
  );

  await page.setViewportSize({ width: 601, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);

  const desktopImages = await page
    .locator(".extension-sections img")
    .evaluateAll((images) =>
      images.map((image) => image.currentSrc || image.src),
    );
  expect(desktopImages).not.toHaveLength(0);
  expect(desktopImages.every((src) => !/\/mobile-/.test(src))).toBe(true);

  await page.setViewportSize({ width: 600, height: 844 });
  await expect
    .poll(() =>
      page
        .locator(".extension-sections img")
        .evaluateAll((images) =>
          images.every((image) =>
            /\/mobile-/.test(image.currentSrc || image.src),
          ),
        ),
    )
    .toBe(true);
});
