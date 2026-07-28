const { expect, test } = require("@playwright/test");
const { swipe } = require("./helpers/guide.js");

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
});
test("every guide screenshot uses the correct desktop or mobile variant", async ({
  page,
}) => {
  const imageSources = () =>
    page.locator(".image-grid img").evaluateAll((images) =>
      images.map((image) => ({
        alt: image.alt,
        src: new URL(image.getAttribute("src"), document.baseURI).pathname,
      })),
    );

  await page.setViewportSize({ width: 601, height: 844 });
  await expect.poll(async () => (await imageSources()).length).toBeGreaterThan(0);
  expect((await imageSources()).filter(({ src }) => /\/mobile-/.test(src))).toEqual([]);

  await page.setViewportSize({ width: 600, height: 844 });
  await expect
    .poll(async () => (await imageSources()).every(({ src }) => /\/mobile-/.test(src)))
    .toBe(true);
});

test("desktop favorite organization slides use full-screen captures", async ({
  page,
}) => {
  await page.setViewportSize({ width: 601, height: 844 });
  const dimensions = await page.evaluate(async () => {
    const names = [
      "27-favorite-list-actions.webp",
      "28-favorite-list-renamed.webp",
      "30-favorite-list-reordered.webp",
      "34-favorite-list-deleted.webp",
    ];
    return Promise.all(
      names.map(
        (name) =>
          new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () =>
              resolve({ name, width: image.naturalWidth, height: image.naturalHeight });
            image.onerror = reject;
            image.src = `assets/images/${name}`;
          }),
      ),
    );
  });
  for (const { width, height } of dimensions) {
    expect(width).toBeGreaterThanOrEqual(2000);
    expect(height).toBeGreaterThanOrEqual(1200);
    expect(width / height).toBeGreaterThanOrEqual(1.5);
  }
});

test("responsive explanations show only text for the current layout", async ({
  page,
}) => {
  await expect(page.locator("#search .mobile-only")).toBeVisible();
  await expect(page.locator("#search .desktop-only")).toBeHidden();

  await page.setViewportSize({ width: 601, height: 844 });
  await expect(page.locator("#search .desktop-only")).toBeVisible();
  await expect(page.locator("#search .mobile-only")).toBeHidden();
});

test("guide explains the purpose, operation, and result of any-one mode", async ({
  page,
}) => {
  const section = page
    .locator("#favorite-tools")
    .getByRole("heading", {
      name: "どれか1アイテム",
    })
    .locator("..");
  await expect(section).toContainText("どれか1つを作れる素材リスト");
  await expect(section).toContainText("完成品が直接使う同じ末端素材");
  await expect(section).toContainText("候補間の最大数を1回分だけ表示");
  await expect(section).toContainText("共通して使う末端素材は合算");
  await expect(section).toContainText("素材リストを表示");
  await expect(section).toContainText("もしくは");
});

test("combined favorites explains list selection, both modes, and result controls", async ({
  page,
}) => {
  const combined = page.locator("#combined");
  await expect(combined).toContainText("右端の「◀」");
  await expect(combined).toContainText("チェックボックス");
  await expect(combined).toContainText(
    "どれか1リストをセット数分製作するために必要な素材リスト",
  );
  await expect(combined).toContainText(
    "チェックしたすべてのリストを製作する素材リストではありません",
  );
  await expect(combined).toContainText("完成品が直接使う同じ末端素材は各リスト内で合算");
  await expect(combined).toContainText("同じ中間素材もリスト間の最大数を1回分だけ表示");
  await expect(combined).toContainText("共通して使う末端素材は合算");
  await expect(combined).toContainText("リストごとに指輪の製作数を0・1つ・2つ");
  await expect(
    combined.getByRole("img", { name: "複数リスト用拡張機能の説明ウィンドウ" }),
  ).toBeVisible();
  await expect(
    combined.getByRole("img", {
      name: "どれか1リストで表示した複数リストの素材リスト",
    }),
  ).toBeVisible();
  await expect(
    combined.getByRole("img", {
      name: "複数リストの製作内容を折り畳んだ素材リスト",
    }),
  ).toBeVisible();
});
