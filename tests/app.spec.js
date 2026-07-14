const { expect, test } = require('@playwright/test');

test('renders the guide, metadata, and main navigation', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('FF14 レシピ素材ツリー｜使い方ガイド');
  await expect(page.locator('h1')).toContainText('FF14 レシピ素材ツリー 使い方ガイド');
  await expect(page.locator('#overview')).toBeVisible();
  await expect(page.locator('#search')).toBeVisible();
  await expect(page.locator('#equipment')).toBeVisible();
  await expect(page.locator('#materials')).toBeVisible();
  await expect(page.locator('#favorites')).toBeVisible();
  await expect(page.locator('#combined')).toBeVisible();
  await expect(page.locator('#share')).toBeVisible();
  await expect(page.locator('.app-open-button')).toHaveAttribute(
    'href',
    'https://jogu6.github.io/ffxiv-recipe/',
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://jogu6.github.io/ffxiv-recipe-about/',
  );
});

test('uses the table of contents to move to a guide section', async ({ page }) => {
  await page.goto('/');

  await page.locator('.toc a[href="#equipment"]').click();
  await expect(page).toHaveURL(/#equipment$/);
  await expect(page.locator('#equipment')).toBeInViewport();
});

test('changes slides in a multi-image gallery', async ({ page }) => {
  await page.goto('/');

  const gallery = page.locator('.image-grid.gallery-ready').first();
  await gallery.scrollIntoViewIfNeeded();
  const slides = gallery.locator('.swiper-slide');
  expect(await slides.count()).toBeGreaterThan(1);

  const firstTransform = await gallery.locator('.swiper-wrapper').evaluate(
    (element) => getComputedStyle(element).transform,
  );
  await gallery.locator('.gallery-arrow-next').click();
  await expect.poll(() => gallery.locator('.swiper-wrapper').evaluate(
    (element) => getComputedStyle(element).transform,
  )).not.toBe(firstTransform);
  await expect(gallery.locator('.swiper-pagination-bullet-active')).toHaveCount(1);
});

test('opens and closes the image viewer and license notice', async ({ page }) => {
  await page.goto('/');

  const zoomButton = page.locator('.zoom-button').first();
  await zoomButton.scrollIntoViewIfNeeded();
  await zoomButton.click();
  await expect(page.locator('.image-viewer')).toHaveClass(/open/);
  await expect(page.locator('.image-viewer-img')).toHaveAttribute('src', /assets\/images\//);
  await page.locator('.image-viewer-close').click();
  await expect(page.locator('.image-viewer')).not.toHaveClass(/open/);

  await page.locator('#licenseBtn').click();
  await expect(page.locator('#licenseOverlay')).toHaveClass(/open/);
  await expect(page.locator('#licenseText')).toContainText('This project is unofficial');
  await page.locator('#licenseCloseBtn').click();
  await expect(page.locator('#licenseOverlay')).not.toHaveClass(/open/);
});

test('supports mobile images and the Top button at 600px', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 700 });
  await page.goto('/');

  const mobileImage = page.locator('img[src*="mobile-"]').first();
  await expect(mobileImage).toBeAttached();
  await expect(page.locator('.toc-toggle')).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator('.top-button')).toHaveClass(/visible/);
  await page.locator('.top-button').click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(50);
});

test('loads without JavaScript errors or missing local resources', async ({ page }) => {
  const errors = [];
  const missingResources = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() === 404 && response.url().startsWith('http://127.0.0.1:')) {
      missingResources.push(response.url());
    }
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  expect(errors).toEqual([]);
  expect(missingResources).toEqual([]);
});
