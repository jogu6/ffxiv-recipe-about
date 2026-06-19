const { expect, test } = require('@playwright/test');

test('renders generated page with linked URLs and no Home header', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.site-header')).toHaveCount(0);
  await expect(page.locator('h1')).toContainText('FF14レシピ素材ツリー');
  await expect(page.locator('.post a[href="https://jogu6.github.io/ffxiv-recipe/"]')).toBeVisible();
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', 'assets/app-icons/favicon.png');
  await expect(page.locator('.footer')).toContainText('© SQUARE ENIX / Data by XIVAPI / X : @og_ff14');
  await expect(page.locator('.footer a')).toHaveAttribute('href', 'https://x.com/og_ff14');
  await expect(page.locator('.page-heading #licenseBtn')).toBeVisible();
  await expect(page.locator('.app-open-button')).toContainText('FF14レシピ素材ツールを開く');
  await expect(page.locator('.app-open-button')).toHaveAttribute('href', 'https://jogu6.github.io/ffxiv-recipe/');
  await expect(page.locator('.app-open-button')).not.toHaveAttribute('target', /.+/);
  await expect(page.locator('#licenseText')).toContainText('FINAL FANTASY XIV');
});

test('opens and closes the embedded license notice', async ({ page }) => {
  await page.goto('/');

  await page.locator('#licenseBtn').click();
  await expect(page.locator('#licenseOverlay')).toHaveClass(/open/);
  await expect(page.locator('#licenseText')).toContainText('This project is unofficial');

  await page.locator('#licenseCloseBtn').click();
  await expect(page.locator('#licenseOverlay')).not.toHaveClass(/open/);

  await page.locator('#licenseBtn').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#licenseOverlay')).not.toHaveClass(/open/);
});

test('shows gallery controls and changes images within a multi-image post', async ({ page }) => {
  let navigations = 0;
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) navigations += 1;
  });
  await page.goto('/');
  const initialNavigations = navigations;

  const gallery = page.locator('.image-grid').filter({ has: page.locator('.image-frame').nth(1) }).last();
  await gallery.scrollIntoViewIfNeeded();
  await expect(gallery).toHaveClass(/gallery-ready/);
  await expect(gallery.locator('.gallery-dot')).toHaveCount(3);

  await expect(gallery.locator('.gallery-track > .image-frame')).toHaveCount(3);
  const firstState = await gallery.evaluate(gallery => {
    const viewport = gallery.querySelector('.gallery-viewport');
    return { index: gallery.dataset.index, scrollLeft: viewport.scrollLeft, clientWidth: viewport.clientWidth };
  });
  expect(firstState.index).toBe('0');

  await gallery.locator('.gallery-next').click();
  await expect.poll(() => gallery.evaluate(gallery => gallery.dataset.index)).toBe('1');
  await expect.poll(() => gallery.evaluate(gallery => gallery.querySelector('.gallery-viewport').scrollLeft)).toBeGreaterThan(0);
  const afterButton = await gallery.evaluate(gallery => {
    const viewport = gallery.querySelector('.gallery-viewport');
    return { scrollLeft: viewport.scrollLeft, clientWidth: viewport.clientWidth };
  });
  expect(afterButton.scrollLeft).toBeGreaterThan(firstState.scrollLeft);
  expect(navigations).toBe(initialNavigations);

  const box = await gallery.locator('.gallery-viewport').boundingBox();
  if (!box) throw new Error('Gallery is not visible');
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5, { steps: 8 });
  const duringDrag = await gallery.evaluate(gallery => {
    const viewport = gallery.querySelector('.gallery-viewport');
    return { scrollLeft: viewport.scrollLeft };
  });
  expect(duringDrag.scrollLeft).toBeGreaterThan(afterButton.scrollLeft);
  await page.mouse.up();
  await expect.poll(() => gallery.evaluate(gallery => gallery.dataset.index)).toBe('2');
  expect(navigations).toBe(initialNavigations);
  await expect(gallery.locator('.gallery-dot.active')).toHaveAttribute('aria-current', 'true');

  await gallery.locator('.gallery-dot').nth(0).click();
  await expect.poll(() => gallery.evaluate(gallery => gallery.dataset.index)).toBe('0');
  await expect.poll(() => gallery.evaluate(gallery => gallery.querySelector('.gallery-viewport').scrollLeft)).toBe(0);

  await gallery.locator('.gallery-dot').nth(2).click();
  await expect.poll(() => gallery.evaluate(gallery => gallery.dataset.index)).toBe('2');
  await expect(gallery.locator('.gallery-dot').nth(2)).toHaveClass(/active/);
});

test('opens and closes the original-size image viewer', async ({ page }) => {
  await page.goto('/');

  const zoom = page.locator('.image-frame.can-zoom .zoom-button').first();
  await expect(zoom).toBeVisible();
  await zoom.click();

  await expect(page.locator('.image-viewer')).toHaveClass(/open/);
  await expect(page.locator('.image-viewer-close')).toHaveCSS('width', /\d+px/);
  await page.locator('.image-viewer-close').click();
  await expect(page.locator('.image-viewer')).not.toHaveClass(/open/);
});

test('supports mobile width and the Top button', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 500 });
  await page.goto('/');

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator('.top-button')).toHaveClass(/visible/);
  await page.locator('.top-button').click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(50);
});

test('does not show zoom controls for images rendered at original width', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  const data = await page.locator('.image-frame').evaluateAll(frames => frames.map((frame, index) => {
    const img = frame.querySelector('img');
    const button = frame.querySelector('.zoom-button');
    const rect = img.getBoundingClientRect();
    return {
      index,
      naturalWidth: img.naturalWidth,
      renderedWidth: rect.width,
      frameHidden: frame.hidden,
      buttonHidden: button.hidden,
      canZoom: frame.classList.contains('can-zoom')
    };
  }));

  const originalWidthImages = data.filter(item => !item.frameHidden && item.naturalWidth > 0 && item.naturalWidth <= Math.ceil(item.renderedWidth) + 1);
  expect(originalWidthImages.length).toBeGreaterThan(0);
  for (const item of originalWidthImages) {
    expect(item.canZoom).toBe(false);
    expect(item.buttonHidden).toBe(true);
  }
});

