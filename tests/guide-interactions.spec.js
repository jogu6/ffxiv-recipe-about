const { expect, test } = require("@playwright/test");
const { swipe } = require("./helpers/guide.js");

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
});
test("carousel drags with a mouse in both directions without moving vertically", async ({
  page,
}) => {
  const gallery = page.locator("#search .image-grid");
  await gallery.scrollIntoViewIfNeeded();
  const viewport = gallery.locator(".gallery-viewport");
  const scrollY = await page.evaluate(() => window.scrollY);

  const box = await viewport.boundingBox();
  const y = Math.max(80, box.y + 120);
  await page.mouse.move(box.x + box.width * 0.85, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.15, y, { steps: 10 });
  await page.mouse.up();
  await expect(viewport.locator(".swiper-slide-active figcaption")).toHaveText(
    "②レシピを確認",
  );
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollY);

  await page.mouse.move(box.x + box.width * 0.15, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.85, y, { steps: 10 });
  await page.mouse.up();
  await expect(viewport.locator(".swiper-slide-active figcaption")).toHaveText(
    "①候補をタップ",
  );
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollY);
});

test("carousel swipes with touch input", async ({ page }) => {
  const gallery = page.locator("#search .image-grid");
  await gallery.scrollIntoViewIfNeeded();
  await swipe(page, gallery.locator(".gallery-viewport"), 0.85, 0.15);
  await expect(gallery.locator(".swiper-slide-active figcaption")).toHaveText(
    "②レシピを確認",
  );
});

test("arrow controls move one slide", async ({ page }) => {
  const gallery = page.locator("#favorites .image-grid").first();
  await gallery.scrollIntoViewIfNeeded();
  await gallery.locator(".gallery-arrow-next").click();
  await expect(gallery.locator(".swiper-slide-active figcaption")).toHaveText(
    "登録後の📌",
  );
  await gallery.locator(".gallery-arrow-previous").click();
  await expect(gallery.locator(".swiper-slide-active figcaption")).toHaveText(
    "登録先を選ぶ",
  );
});

test("expanded image close control communicates that it is clickable", async ({
  page,
}) => {
  await page.locator("#search .zoom-button").first().click();
  const close = page.locator(".image-viewer-close");
  await expect(close).toBeVisible();
  await expect(close).toHaveText("✕");
  await expect(close).toHaveCSS("cursor", "pointer");
  const closeBox = await close.boundingBox();
  expect(closeBox.x + closeBox.width).toBeGreaterThan(360);
  expect(closeBox.y).toBeLessThan(20);
  const stage = page.locator(".image-viewer-stage");
  const box = await stage.boundingBox();
  await page.mouse.move(box.x + 180, box.y + 180);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 80, { steps: 5 });
  await page.mouse.up();
  await expect(close).toBeVisible();
  await stage.click({ position: { x: 20, y: 20 } });
  await expect(close).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(close).not.toBeVisible();
});

test("phone image viewer pinches between fit size and natural size", async ({
  page,
}) => {
  await page.locator("#search .zoom-button").first().click();
  const stage = page.locator(".image-viewer-stage");
  const image = page.locator(".image-viewer-img");
  await expect(image).toHaveAttribute("data-scale", /.+/);
  const minimum = Number(await image.getAttribute("data-scale"));
  const expectedMinimum = await image.evaluate((element) =>
    Math.min(
      1,
      element.parentElement.clientWidth / element.naturalWidth,
      element.parentElement.clientHeight / element.naturalHeight,
    ),
  );
  expect(minimum).toBeCloseTo(expectedMinimum, 3);

  const box = await stage.boundingBox();
  const client = await page.context().newCDPSession(page);
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: centerX - 30, y: centerY },
      { x: centerX + 30, y: centerY },
    ],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: centerX - 180, y: centerY },
      { x: centerX + 180, y: centerY },
    ],
  });
  await expect.poll(async () => Number(await image.getAttribute("data-scale"))).toBe(1);
  const naturalSize = await image.evaluate((element) => ({
    renderedWidth: element.getBoundingClientRect().width,
    naturalWidth: element.naturalWidth,
  }));
  expect(naturalSize.renderedWidth).toBeCloseTo(naturalSize.naturalWidth, 0);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: centerX - 5, y: centerY },
      { x: centerX + 5, y: centerY },
    ],
  });
  await expect
    .poll(async () => Number(await image.getAttribute("data-scale")))
    .toBeGreaterThanOrEqual(minimum);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
});
