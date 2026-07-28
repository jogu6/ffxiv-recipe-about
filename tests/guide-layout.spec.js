const { expect, test } = require("@playwright/test");
const { swipe } = require("./helpers/guide.js");

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
});
test("guide shows equipment item-level choices and production disclosure results", async ({
  page,
}) => {
  await expect(page.locator("#equipment")).toContainText(
    "指定した装備レベルに対応する候補だけ",
  );
  await expect(
    page.getByRole("img", {
      name: "装備レベルに対応するアイテムレベルの選択肢",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "個数指定の製作内容を折り畳んだ素材リスト" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "どれか1アイテムの製作内容を折り畳んだ素材リスト",
    }),
  ).toBeVisible();
});

test("guide explains share plaza import and copy actions", async ({ page }) => {
  await page.goto("/");
  const section = page.locator("#share-plaza").locator("..");
  const image = section.getByRole("img", {
    name: "取り込みボタンとコピーボタンを表示したシェアコード広場",
  });
  await expect(section).toContainText("シェアコード広場を開く");
  await expect(section).toContainText("シェアコードを取り込む");
  await expect(section).toContainText("シェアコードをコピー");
  await image.scrollIntoViewIfNeeded();
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0);
});

test("gallery image and controls fit a practical phone viewport", async ({
  page,
}) => {
  const gallery = page.locator("#favorites .image-grid").first();
  await gallery.scrollIntoViewIfNeeded();
  const box = await gallery.boundingBox();
  expect(box.height).toBeLessThanOrEqual(844);
  await expect(gallery.locator(".gallery-arrow-next")).toBeVisible();
  await expect(gallery.locator(".gallery-dots")).toBeVisible();
});

test("table of contents shrinks to its content and toggles on desktop", async ({
  page,
}) => {
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
  await expect(page.locator(".toc-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page.locator(".toc-toggle").click();
  await expect(list).toBeVisible();
});

test("short desktop viewport scrolls only the table of contents list", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 500 });
  await page.reload();
  const toc = page.locator(".toc");
  const list = page.locator(".toc > ol");
  const tocBox = await toc.boundingBox();
  expect(tocBox.y + tocBox.height).toBeLessThanOrEqual(500);
  await expect(list).toHaveCSS("overflow-y", "auto");
  expect(
    await list.evaluate((element) => element.scrollHeight),
  ).toBeGreaterThan(await list.evaluate((element) => element.clientHeight));
});
