const { expect, test } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
});

test("主要機能の操作画像を各章に掲載する", async ({ page }) => {
  for (const sectionId of [
    "basics",
    "equipment",
    "materials",
    "favorites",
    "favorite-conditions",
    "combined",
    "content-share",
    "favorite-share",
    "display",
  ]) {
    await expect(page.locator(`#${sectionId} .image-grid img`).first()).toBeAttached();
  }
});

test("ギャラリー画像と操作部品がスマートフォン画面内に収まる", async ({ page }) => {
  const gallery = page.locator("#favorites .image-grid").first();
  await gallery.scrollIntoViewIfNeeded();
  const box = await gallery.boundingBox();
  expect(box.height).toBeLessThanOrEqual(844);
  await expect(gallery.locator(".gallery-arrow-next")).toBeVisible();
  await expect(gallery.locator(".gallery-dots")).toBeVisible();
});

test("デスクトップの目次は内容に合わせて縮み、開閉できる", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  const toc = page.locator(".toc");
  const list = page.locator(".toc > ol");
  const tocBox = await toc.boundingBox();
  const listBox = await list.boundingBox();
  expect(tocBox.height - listBox.height).toBeLessThan(60);
  await page.locator(".toc-toggle").click();
  await expect(toc).toHaveClass(/collapsed/);
  await expect(list).toBeHidden();
  await page.locator(".toc-toggle").click();
  await expect(list).toBeVisible();
});

test("短いデスクトップ画面では目次一覧だけをスクロールする", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 500 });
  await page.reload();
  const toc = page.locator(".toc");
  const list = page.locator(".toc > ol");
  const tocBox = await toc.boundingBox();
  expect(tocBox.y + tocBox.height).toBeLessThanOrEqual(500);
  await expect(list).toHaveCSS("overflow-y", "auto");
  expect(await list.evaluate((element) => element.scrollHeight)).toBeGreaterThan(
    await list.evaluate((element) => element.clientHeight),
  );
});
