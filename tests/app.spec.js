const { expect, test } = require('@playwright/test');

test('renders the guide, metadata, and main navigation', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('XIVca | 使い方ガイド');
  await expect(page.locator('.page-heading-icon')).toBeVisible();
  await expect(page.locator('.xivca-wordmark')).toHaveAttribute('src', 'assets/xivca-logo.webp');
  await expect(page.locator('.xivca-wordmark')).toBeVisible();
  await expect(page.locator('.app-formal-name')).toHaveText('FinalFantasy XIV® Crafting Assistant XIVca(シヴカ)');
  await expect(page.locator('.guide-title')).toHaveText('使い方ガイド');
  await expect(page.locator('.guide-version')).toHaveText('v3.23 対応');
  const headingStyle = await page.locator('.guide-brand').evaluate((brand) => {
    const formalName = brand.querySelector('.app-formal-name');
    const guideTitle = brand.querySelector('.guide-title');
    const guideVersion = brand.querySelector('.guide-version');
    return {
      formalTop: formalName.getBoundingClientRect().top,
      titleTop: guideTitle.getBoundingClientRect().top,
      titleColor: getComputedStyle(guideTitle).color,
      formalColor: getComputedStyle(formalName).color,
      versionColor: getComputedStyle(guideVersion).color,
      formalSize: Number.parseFloat(getComputedStyle(formalName).fontSize),
      versionSize: Number.parseFloat(getComputedStyle(guideVersion).fontSize),
      titleBottom: guideTitle.getBoundingClientRect().bottom,
      versionBottom: guideVersion.getBoundingClientRect().bottom,
    };
  });
  expect(headingStyle.formalTop).toBeLessThan(headingStyle.titleTop);
  expect(headingStyle.formalColor).toBe(headingStyle.versionColor);
  expect(headingStyle.titleColor).not.toBe(headingStyle.versionColor);
  expect(Math.abs(headingStyle.formalSize - headingStyle.versionSize)).toBeLessThan(0.01);
  expect(Math.abs(headingStyle.titleBottom - headingStyle.versionBottom)).toBeLessThan(0.5);
  await expect(page.locator('#overview')).toBeVisible();
  await expect(page.locator('#basics')).toBeVisible();
  await expect(page.locator('#equipment')).toBeVisible();
  await expect(page.locator('#materials')).toBeVisible();
  await expect(page.locator('#favorites')).toBeVisible();
  await expect(page.locator('#combined')).toBeVisible();
  await expect(page.locator('#content-share')).toBeVisible();
  await expect(page.locator('.app-open-button')).toHaveAttribute(
    'href',
    'http://127.0.0.1:4173/',
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://jogu6.github.io/ffxiv-recipe-about/',
  );
});

test('renders the standalone share code plaza safely and copies a share code', async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async text => { window.__copiedShareCode = text; },
        readText: async () => window.__copiedShareCode || '',
      },
    });
  });
  await page.goto('/share-code-plaza.html');
  await expect(page).toHaveTitle('XIVca | シェアコード広場');
  await expect(page.getByRole('heading', { name: 'シェアコード広場' })).toBeVisible();
  await expect(page.getByText('Discordの「シェアコード広場」へ投稿されたお気に入りリストを掲載しています。アイテム内容を確認し、そのままXIVcaへ取り込むか、シェアコードをコピーできます。掲載内容は定期的にDiscordから反映されます。', { exact: true })).toBeVisible();
  await expect(page.locator('footer')).toContainText('© SQUARE ENIX / Data: Lodestone');
  await page.getByRole('button', { name: 'LICENSE' }).click();
  await expect(page.locator('#licenseOverlay')).toHaveClass(/open/);
  await expect(page.locator('#licenseText')).toContainText('SQUARE ENIX');
  await page.locator('#licenseCloseBtn').click();
  await expect(page.locator('#licenseOverlay')).not.toHaveClass(/open/);
  const firstCard = page.locator('.share-card').first();
  const importButton = firstCard.getByRole('button', { name: 'シェアコードを取り込む' });
  const copyButton = firstCard.locator('.copy-button');
  await expect(firstCard.locator('.share-actions > button')).toHaveCount(2);
  const importBox = await importButton.boundingBox();
  const copyBox = await copyButton.boundingBox();
  expect(importBox).toBeTruthy();
  expect(copyBox).toBeTruthy();
  expect(Math.abs(importBox.y - copyBox.y)).toBeLessThan(1);
  const expectedCode = await importButton.getAttribute('data-code');
  expect(expectedCode).toMatch(/^N[A-Za-z0-9_-]+$/);
  await copyButton.click();
  await expect(copyButton).toHaveText('コピー済み');
  await expect(firstCard.locator('.import-result')).toHaveText('シェアコードをコピーしました');
  await expect.poll(() => page.evaluate(() => window.__copiedShareCode)).toBe(expectedCode);
  await page.getByRole('button', { name: '閉じる' }).click();
  await expect(page).toHaveURL(/share-code-plaza\.html$/);
});

test('uses the table of contents to move to a guide section', async ({ page }) => {
  await page.goto('/');

  await page.locator('.toc a[href="#equipment"]').click();
  await expect(page).toHaveURL(/#equipment$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
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
  await expect.poll(() => zoomButton.locator('xpath=../img').evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
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
