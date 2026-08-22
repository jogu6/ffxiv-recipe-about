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
  await expect(page.locator(".post .step")).toHaveCount(0);

  const orderedSections = await page
    .locator(".post-list > section")
    .evaluateAll((sections) => sections.map((section) => section.id));
  expect(orderedSections).toEqual([
    "overview",
    "basics",
    "equipment",
    "materials",
    "favorites",
    "favorite-conditions",
    "combined",
    "content-share",
    "favorite-share",
    "display",
    "data-update",
    "notes",
  ]);

  const targets = await page
    .locator("#toc-list > li > a")
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

  const nestedTargets = await page
    .locator("#toc-list > li > ol a")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  for (const target of nestedTargets) await expect(page.locator(target)).toHaveCount(1);
});

test("visible table of contents links only target visible headings", async ({ page }) => {
  for (const width of [390, 600, 601, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const invalidTargets = await page.locator("#toc-list a:visible").evaluateAll((links) =>
      links.flatMap((link) => {
        const target = document.querySelector(link.getAttribute("href"));
        return target && target.getClientRects().length > 0
          ? []
          : [link.getAttribute("href")];
      }),
    );
    expect(invalidTargets).toEqual([]);
  }
});

test("table of contents jumps do not hide headings at layout boundaries", async ({ page }) => {
  await page.addStyleTag({ content: "html { scroll-behavior: auto !important; }" });
  for (const width of [390, 600, 601, 840, 841, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const obscured = await page.locator("#toc-list a:visible").evaluateAll((links) =>
      links.flatMap((link) => {
        const href = link.getAttribute("href");
        window.scrollTo(0, 0);
        link.click();
        const heading = document.querySelector(href).getBoundingClientRect();
        const toc = document.querySelector(".toc").getBoundingClientRect();
        const overlapsToc =
          heading.left < toc.right &&
          heading.right > toc.left &&
          heading.top < toc.bottom &&
          heading.bottom > toc.top;
        return heading.top < 0 || overlapsToc
          ? [{ target: href, top: heading.top, overlapsToc }]
          : [];
      }),
    );
    expect(obscured, `${width}pxで目次のジャンプ先が隠れています`).toEqual([]);
  }
});

test("heading keeps both logos and fits two text lines between the logo and license", async ({ page }) => {
  for (const width of [390, 600, 601, 840, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => page.locator(".app-formal-name").evaluate((name) =>
      name.scrollWidth <= name.clientWidth + 1,
    )).toBe(true);
    await expect.poll(() => page.locator(".guide-edition").evaluate((line) =>
      line.scrollWidth <= line.clientWidth + 1,
    )).toBe(true);
    await expect.poll(() => page.locator(".guide-brand").evaluate((brand) => {
      const formalName = brand.querySelector(".app-formal-name");
      const title = brand.querySelector(".guide-title");
      const version = brand.querySelector(".guide-version");
      const sameSize = Math.abs(
        Number.parseFloat(getComputedStyle(formalName).fontSize)
          - Number.parseFloat(getComputedStyle(version).fontSize),
      ) < 0.01;
      const sameBottom = Math.abs(
        title.getBoundingClientRect().bottom - version.getBoundingClientRect().bottom,
      ) < 0.5;
      return sameSize && sameBottom;
    })).toBe(true);

    const positions = await page.locator(".heading-row").evaluate((row) => {
      const rect = (selector) => row.querySelector(selector).getBoundingClientRect();
      const icon = rect(".page-heading-icon");
      const logo = rect(".xivca-wordmark");
      const brand = rect(".guide-brand");
      const formalName = rect(".app-formal-name");
      const edition = rect(".guide-edition");
      const license = rect(".license-button");
      return {
        iconToLogo: logo.left - icon.right,
        logoToBrand: brand.left - logo.right,
        brandToLicense: license.left - brand.right,
        brandHeight: brand.height,
        logoHeight: logo.height,
        formalAboveEdition: formalName.top < edition.top,
      };
    });
    expect(positions.iconToLogo).toBeGreaterThanOrEqual(7);
    expect(positions.logoToBrand).toBeGreaterThanOrEqual(7);
    expect(positions.brandToLicense).toBeGreaterThanOrEqual(11);
    expect(positions.brandHeight).toBeLessThanOrEqual(positions.logoHeight + 0.5);
    expect(positions.formalAboveEdition).toBe(true);
  }
});

test("table of contents follows the layout and does not clip labels", async ({
  page,
}) => {
  for (const width of [601, 840, 841, 1440, 1920]) {
    await page.setViewportSize({ width, height: 500 });
    await page.reload();
    await page.evaluate(() => document.fonts.ready);

    const toc = page.locator(".toc");
    const tocBox = await toc.boundingBox();
    if (width <= 840) {
      await expect(toc).toHaveCSS("position", "static");
      const contentBox = await page.locator(".post-list").boundingBox();
      expect(tocBox.y + tocBox.height).toBeLessThanOrEqual(contentBox.y + 1);
    } else {
      await expect(toc).toHaveCSS("position", "sticky");
      const footerBox = await page.locator("footer").boundingBox();
      expect(tocBox.y + tocBox.height).toBeLessThanOrEqual(footerBox.y - 8 + 1);
    }
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
    .locator(".image-grid img")
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

  await expect
    .poll(() =>
      page.locator(".image-grid img").evaluateAll((images) =>
        images.length > 0 && images.every((image) => !/\/mobile-/.test(image.currentSrc || image.src)),
      ),
    )
    .toBe(true);

  await page.setViewportSize({ width: 600, height: 844 });
  await expect
    .poll(() =>
      page
        .locator(".image-grid img")
        .evaluateAll((images) =>
          images.every((image) =>
            /\/mobile-/.test(image.currentSrc || image.src),
          ),
        ),
    )
    .toBe(true);
});
