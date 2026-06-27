const { expect, test } = require('@playwright/test');

test('renders generated page with linked URLs and no Home header', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.site-header')).toHaveCount(0);
  await expect(page.locator('h1')).toContainText('FF14レシピ素材ツリー');
  await expect(page.locator('.post a[href="https://jogu6.github.io/ffxiv-recipe/"]')).toBeVisible();
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', 'assets/app-icons/favicon.png');
  await expect(page.locator('.footer')).toContainText('© SQUARE ENIX / Data by XIVAPI / X : @ff14_recipe');
  await expect(page.locator('.footer a')).toHaveAttribute('href', 'https://x.com/ff14_recipe');
  await expect(page.locator('.page-heading #licenseBtn')).toBeVisible();
  await expect(page.locator('.app-open-button')).toContainText('FF14レシピ素材ツールを開く');
  await expect(page.locator('.app-open-button')).toHaveAttribute('href', 'https://jogu6.github.io/ffxiv-recipe/');
  await expect(page.locator('.app-open-button')).not.toHaveAttribute('target', /.+/);
  await expect(page.locator('#licenseText')).toContainText('FINAL FANTASY XIV');
});

test('uses configurable SEO keywords in metadata and structured data', async ({ page }) => {
  await page.goto('/');

  const keywords = await page.locator('meta[name="keywords"]').getAttribute('content');
  expect(keywords).toContain('レシピ検索');
  expect(keywords).toContain('クラフター');
  expect(keywords).toContain('ギャザラー');
  expect(keywords).toContain('中間素材');

  const structuredData = await page.locator('script[type="application/ld+json"]').textContent();
  expect(structuredData).toContain('レシピ検索');
  expect(structuredData).toContain('ギャザラー');
});

test('uses one compact post width based on the widest post', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  await expect(page.locator('body')).toHaveClass(/layout-width-ready/);
  await expect(page.locator('.post-list')).toHaveClass(/width-ready/);

  const widths = await page.locator('.post').evaluateAll(posts => posts.map(post => {
    const postRect = post.getBoundingClientRect();
    const style = getComputedStyle(post);
    const chromeWidth = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight) +
      Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth);
    const contentWidths = Array.from(post.children).map(child => {
      if (child.classList.contains('gallery-ready')) {
        return Math.max(...Array.from(child.querySelectorAll('.image-frame img')).map(img => img.getBoundingClientRect().width));
      }
      return child.getBoundingClientRect().width;
    });
    return {
      postWidth: postRect.width,
      innerWidth: postRect.width - chromeWidth,
      widestContent: Math.max(...contentWidths)
    };
  }));

  expect(widths.length).toBeGreaterThan(0);
  const postWidths = widths.map(item => item.postWidth);
  expect(Math.max(...postWidths) - Math.min(...postWidths)).toBeLessThanOrEqual(1);

  for (const item of widths) {
    expect(item.postWidth).toBeLessThan(960);
  }

  const widestContent = Math.max(...widths.map(item => item.widestContent));
  const tightestSurplus = Math.min(...widths.map(item => item.innerWidth - item.widestContent));
  expect(Math.max(...postWidths) - widestContent).toBeLessThanOrEqual(30);
  expect(tightestSurplus).toBeLessThanOrEqual(2);

  const headingWidth = await page.locator('.page-heading').evaluate(heading => heading.getBoundingClientRect().width);
  expect(Math.abs(headingWidth - Math.max(...postWidths))).toBeLessThanOrEqual(1);
});

test('renders same-server Discord channel URLs as channel labels', async ({ page }) => {
  await page.goto('/');

  const channelLink = page.locator('.discord-channel-link[href="https://discord.com/channels/1516679768978886687/1516701219828138054"]');
  await expect(channelLink).toContainText('# シェアコード広場');
  await expect(channelLink).not.toContainText('discord.com/channels');
  await expect(page.locator('.post a[href="https://x.com/ff14_recipe"]')).toBeVisible();
  await expect(page.locator('.post a[href="https://discord.gg/eZP5temK6e"]')).toBeVisible();
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
  const initialScrollY = await page.evaluate(() => window.scrollY);

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
  const scrollYAfterNext = await page.evaluate(() => window.scrollY);
  expect(Math.abs(scrollYAfterNext - initialScrollY)).toBeLessThanOrEqual(1);

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
  const scrollYAfterDot = await page.evaluate(() => window.scrollY);
  expect(Math.abs(scrollYAfterDot - initialScrollY)).toBeLessThanOrEqual(1);
});

test('fits image posts within the viewport height while preserving image aspect ratios', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 500 });
  await page.goto('/');

  const postData = await page.locator('.post').evaluateAll(posts => posts
    .filter(post => post.querySelector('.image-grid'))
    .map(post => {
      const rect = post.getBoundingClientRect();
      return { height: rect.height };
    }));
  const footerHeight = await page.locator('.footer').evaluate(footer => footer.getBoundingClientRect().height);
  const maxPostHeight = 500 - footerHeight - 18 + 1;

  expect(postData.length).toBeGreaterThan(0);
  for (const post of postData) {
    expect(post.height).toBeLessThanOrEqual(maxPostHeight);
  }

  const imageData = await page.locator('.image-frame img').evaluateAll(images => images.map(img => {
    const rect = img.getBoundingClientRect();
    return {
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      renderedWidth: rect.width,
      renderedHeight: rect.height
    };
  }));

  expect(imageData.length).toBeGreaterThan(1);
  for (const image of imageData) {
    expect(image.renderedHeight).toBeGreaterThan(0);
    const naturalRatio = image.naturalWidth / image.naturalHeight;
    const renderedRatio = image.renderedWidth / image.renderedHeight;
    expect(Math.abs(renderedRatio - naturalRatio)).toBeLessThan(0.02);
  }
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

