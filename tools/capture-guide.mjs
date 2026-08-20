import { chromium } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const guideRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.resolve(guideRoot, "..", "ffxiv-recipe");
const imageRoot = path.join(guideRoot, "src", "guide", "assets", "images");
const stagingRoot = path.join(guideRoot, "src", "guide", "assets", ".images-staging");
const favoriteSamplePath = path.join(guideRoot, "tools", "guide-favorite-lists.txt");
const generated = new Set();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function startServer(command, args, cwd) {
  return spawn(command, args, { cwd, stdio: "ignore", windowsHide: true });
}
const appServer = startServer(
  "py",
  ["-m", "http.server", "4173", "--bind", "0.0.0.0", "--directory", "site"],
  appRoot,
);
const guideServer = startServer(
  "node",
  ["tools/serve-site.mjs", "--port", "4174"],
  guideRoot,
);

async function waitForServer(url) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error(`ローカルサーバーを起動できませんでした: ${url}`);
}

function stopServer(server) {
  if (!server.pid) return;
  if (process.platform !== "win32") return server.kill();
  try {
    execFileSync("taskkill.exe", ["/PID", String(server.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } catch {
    server.kill();
  }
}

async function waitForAnimations(page) {
  await page.evaluate(async () => {
    const visible = (animation) => {
      const target = animation.effect?.target;
      if (!(target instanceof Element)) return true;
      const style = getComputedStyle(target);
      return target.getClientRects().length > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const deadline = performance.now() + 15_000;
    let quietFrames = 0;
    while (quietFrames < 2) {
      const active = document.getAnimations({ subtree: true }).filter(
        (animation) => visible(animation) && ["running", "pending"].includes(animation.playState),
      );
      if (active.some((animation) => !Number.isFinite(animation.effect?.getComputedTiming().endTime))) {
        throw new Error("終了しない表示中アニメーションがあります");
      }
      if (active.length) {
        quietFrames = 0;
        await Promise.allSettled(active.map((animation) => animation.finished));
      } else {
        quietFrames += 1;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      if (performance.now() > deadline) throw new Error("アニメーションの終了待機がタイムアウトしました");
    }
  });
}

async function waitForCaptureReady(page) {
  await page.evaluate(async () => {
    await document.fonts?.ready;
    const images = [...document.images].filter((image) => {
      const rect = image.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
    });
    await Promise.allSettled(images.map(async (image) => {
      if (!image.complete) await new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
      await image.decode?.();
    }));
  });
  await waitForAnimations(page);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function save(page, name, expectedState = null) {
  if (!name.endsWith(".webp")) throw new Error(`WebP以外は保存できません: ${name}`);
  if (generated.has(name)) throw new Error(`画像名が重複しています: ${name}`);
  if (expectedState) await expectedState();
  await waitForCaptureReady(page);
  const outputPath = path.join(stagingRoot, name);
  if (await stat(outputPath).then(() => true, () => false)) {
    generated.add(name);
    return;
  }
  const invalid = await page.evaluate(() => {
    const loading = document.querySelector("#loadingOverlay");
    return {
      loading: loading && getComputedStyle(loading).display !== "none" && loading.getClientRects().length > 0,
      selectedText: document.getSelection()?.isCollapsed === false,
    };
  });
  if (invalid.loading || invalid.selectedText) throw new Error(`${name}: 撮影前の状態が不正です ${JSON.stringify(invalid)}`);
  const buffer = await page.screenshot({ fullPage: false, type: "png", scale: "device" });
  await sharp(buffer).webp({ quality: 94, smartSubsample: true }).toFile(outputPath);
  const metadata = await sharp(outputPath).metadata();
  const viewport = page.viewportSize();
  const expectedWidth = viewport.width * 2;
  const expectedHeight = viewport.height * 2;
  if (metadata.width !== expectedWidth || metadata.height !== expectedHeight) {
    throw new Error(`${name}: 寸法が不正です ${metadata.width}x${metadata.height} (期待値 ${expectedWidth}x${expectedHeight})`);
  }
  generated.add(name);
}

const expectVisible = (page, selector) => page.locator(selector).waitFor({ state: "visible" });

const PRIMARY_FAVORITE = "戦闘ジョブ食事";
const SECONDARY_FAVORITE = "ギャザクラ食事";
const ANY_ITEM_FAVORITE = "コートリーラヴァー武器";
const RING_FAVORITE = "コートリーラヴァー・ディフェンダー";
const COMBINED_FAVORITES = [
  "コートリーラヴァー・ディフェンダー",
  "コートリーラヴァー・ヒーラー",
  "コートリーラヴァー・ストライカー",
  "コートリーラヴァー・スレイヤー",
  "コートリーラヴァー・スカウト",
  "コートリーラヴァー・レンジャー",
  "コートリーラヴァー・キャスター",
];
let favoriteSeeds = null;

const clone = (value) => JSON.parse(JSON.stringify(value));

async function assertNoRecipeResolutionNotice(page, context) {
  const notice = page.locator(".recipe-resolution-notice");
  const count = await notice.count();
  const open = await page.locator("#confirmOverlay.info.open .recipe-resolution-notice").isVisible();
  if (count || open) throw new Error(`${context}: 製作方法情報の自動設定案内が生成されました`);
}

function subsetFavoriteSeed(seed, names) {
  const wanted = new Set(names);
  const recent = seed.lists.find((list) => list.id === "recent-searches" || list.name === "検索履歴");
  const lists = seed.lists.filter((list) => wanted.has(list.name));
  if (lists.length !== wanted.size) {
    const found = new Set(lists.map((list) => list.name));
    throw new Error(`撮影用お気に入りが不足しています: ${[...wanted].filter((name) => !found.has(name)).join(", ")}`);
  }
  return { ...seed, selectedListId: null, lists: [...(recent ? [recent] : []), ...lists] };
}

function favoriteSeed(kind) {
  if (!favoriteSeeds?.[kind]) throw new Error(`お気に入り撮影データが未準備です: ${kind}`);
  return clone(favoriteSeeds[kind]);
}

async function openApp(page, seed = null) {
  page.setDefaultTimeout(120_000);
  await page.addInitScript((stored) => {
    localStorage.clear();
    localStorage.setItem("ff14_successful_boot_v1", "1");
    if (stored) localStorage.setItem("ff14_favorite_lists_v3", JSON.stringify(stored));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => { window.__guideSharedText = text; } },
    });
  }, seed);
  await page.goto("http://127.0.0.1:4173/");
  await page.locator("#loadingOverlay").waitFor({ state: "hidden" });
  if (await page.locator("#releaseNoticeOverlay.open").isVisible()) await page.locator("#releaseNoticeOkBtn").click();
  await waitForCaptureReady(page);
}

async function newPage(browser, mobile = false, seed = null) {
  const page = await browser.newPage({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    hasTouch: mobile,
    isMobile: mobile,
  });
  await openApp(page, seed);
  return page;
}

async function prepareFavoriteSeeds(browser) {
  const page = await newPage(browser, false);
  await page.locator("#settingsBtn").click();
  await page.locator("#importAllFavoritesFile").setInputFiles(favoriteSamplePath);
  await expectVisible(page, "#confirmOverlay.favorite-list-file-dialog");
  await page.locator('#confirmOverlay input[name="favorite-list-file-import-mode"][value="replace"]').check();
  await page.locator("#confirmYes").click();
  await expectVisible(page, "#confirmOverlay.favorite-list-file-final-confirm");
  await page.locator("#confirmYes").click();
  await page.locator("#confirmOverlay").waitFor({ state: "hidden" });
  await assertNoRecipeResolutionNotice(page, "19リストの読み込み");
  const all = await page.evaluate(() => JSON.parse(localStorage.getItem("ff14_favorite_lists_v3")));
  const importedNames = all.lists.filter((list) => list.name !== "検索履歴").map((list) => list.name);
  if (importedNames.length !== 19) throw new Error(`撮影用お気に入りは19リスト必要です: ${importedNames.length}`);
  favoriteSeeds = {
    all,
    primary: subsetFavoriteSeed(all, [PRIMARY_FAVORITE]),
    management: subsetFavoriteSeed(all, [PRIMARY_FAVORITE, SECONDARY_FAVORITE]),
    anyItem: subsetFavoriteSeed(all, [ANY_ITEM_FAVORITE]),
    ring: subsetFavoriteSeed(all, [RING_FAVORITE]),
    combined: subsetFavoriteSeed(all, COMBINED_FAVORITES),
  };
  await page.close();
}

async function search(page, value, { select = true } = {}) {
  await page.locator("#searchBox").fill(value);
  await page.locator("#searchBox").blur();
  const row = page.locator("#recipeList li").filter({ hasText: value }).first();
  await row.waitFor();
  if (select) await row.click();
}

async function openNormalMaterials(page, itemName) {
  await search(page, itemName);
  await page.locator("#materialsViewBtn").click();
  await page.locator(".materials-section-header").first().waitFor();
}

async function chooseOption(page, id, label) {
  const select = page.locator(`#${id}`);
  if ((await select.getAttribute("data-value")) === label) return;
  await select.locator(".custom-select-toggle").click();
  await select.locator(".custom-select-option").getByText(label, { exact: true }).click();
}

async function pressForCapture(page, locator, name) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${name}: 操作対象が表示されていません`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await save(page, name);
  await page.mouse.up();
}

async function openFavorite(page, name = PRIMARY_FAVORITE) {
  await page.locator("#favBtn").click();
  await page.locator("#favoriteLists").getByText(name, { exact: true }).click();
  await assertNoRecipeResolutionNotice(page, `${name}を開く`);
}

async function openFavoriteMaterialOptions(page) {
  await page.locator(".favorite-material-curtain-toggle").click();
  await page.locator(".favorite-material-mode-group").waitFor({ state: "visible" });
}

async function captureSearchAndMaterials(browser, mobile) {
  const prefix = mobile ? "mobile" : "desktop";
  const page = await newPage(browser, mobile);
  await save(page, `${prefix}-02-search-before.webp`);
  await search(page, "ブラスバスタードソード", { select: false });
  await save(page, `${prefix}-02-search-input.webp`);
  await page.locator("#recipeList li").filter({ hasText: "ブラスバスタードソード" }).first().click();
  await save(page, `${prefix}-02-search-result.webp`, () => page.locator(".root-item-main").filter({ hasText: "ブラスバスタードソード" }).waitFor());
  await page.locator("#countInput").fill("3");
  await page.locator("#countInput").dispatchEvent("change");
  await save(page, `${prefix}-02-materials-count.webp`);
  await page.locator("#materialsViewBtn").click();
  await save(page, `${prefix}-02-materials-result.webp`, () => page.locator(".materials-section-header").first().waitFor());
  await page.close();
}

async function captureReverseAndHome(browser, mobile) {
  const prefix = mobile ? "mobile" : "desktop";
  const page = await newPage(browser, mobile);
  await search(page, "山羊乳", { select: false });
  await save(page, `${prefix}-02-reverse-before.webp`);
  const row = page.locator("#recipeList li").filter({ hasText: "山羊乳" }).first();
  await row.click();
  await save(page, `${prefix}-02-reverse-result.webp`, () => page.locator("#usesList li").first().waitFor());
  await save(page, `${prefix}-02-home-before.webp`);
  await page.locator("#appTitle").focus();
  await save(page, `${prefix}-02-home-action.webp`);
  await page.locator("#appTitle").click();
  await save(page, `${prefix}-02-home-result.webp`, () => page.locator("#searchBox").waitFor({ state: "visible" }));
  await page.close();
}

async function captureEquipment(browser, mobile) {
  const prefix = mobile ? "mobile" : "desktop";
  const page = await newPage(browser, mobile);
  await save(page, `${prefix}-03-equipment-before.webp`);
  await page.locator("#equipmentSearchToggle").click();
  await save(page, `${prefix}-03-equipment-open.webp`, () => expectVisible(page, "#equipmentSearchPanel"));
  await chooseOption(page, "equipmentJobSelect", "ナイト");
  await page.locator("#equipmentLevelInput").fill("100");
  await page.locator("#equipmentLevelInput").dispatchEvent("input");
  await chooseOption(page, "equipmentItemLevelSelect", "770");
  await save(page, `${prefix}-03-equipment-conditions.webp`);
  await page.locator("#equipmentSearchBtn").click();
  await save(page, `${prefix}-03-equipment-result.webp`, () => page.locator("#recipeList li").first().waitFor());
  await page.locator("#saveEquipmentSearchBtn").click();
  await save(page, `${prefix}-03-equipment-favorite-name.webp`, () => expectVisible(page, "#textInputDialog"));
  await page.locator("#textInputField").fill("ナイト装備");
  await page.locator("#textInputOkBtn").click();
  await save(page, `${prefix}-03-equipment-favorite-result.webp`);
  await page.close();
}

async function captureCraftMethod(browser, mobile) {
  const prefix = mobile ? "mobile" : "desktop";
  const page = await newPage(browser, mobile);
  await search(page, "ミラージュプリズム");
  await save(page, `${prefix}-04-method-before.webp`);
  const choices = page.locator(".recipe-method-choice");
  if ((await choices.count()) > 1) {
    await page.locator(".result-root-summary .recipe-method-summary").click();
    await choices.nth(1).focus();
    await save(page, `${prefix}-04-method-action.webp`);
    await choices.nth(1).click();
  } else {
    await page.locator("#treeContainer .node-row").first().focus();
    await save(page, `${prefix}-04-method-action.webp`);
  }
  await save(page, `${prefix}-04-method-result.webp`);
  await page.close();
}

async function captureShopAndGathering(browser, mobile) {
  const prefix = mobile ? "mobile" : "desktop";
  let page = await newPage(browser, mobile);
  await search(page, "ブラスバスタードソード");
  await save(page, `${prefix}-04-shop-before.webp`);
  const shop = page.locator(".result-root-summary .shop-info-btn").first();
  await shop.focus();
  await save(page, `${prefix}-04-shop-action.webp`);
  await shop.click();
  await save(page, `${prefix}-04-shop-result.webp`, () => expectVisible(page, "#shopDialog"));
  await page.close();
  page = await newPage(browser, mobile);
  await openNormalMaterials(page, "ゴールドインゴット");
  await save(page, `${prefix}-04-gather-before.webp`);
  const timer = page.locator(".gathering-timer-btn:visible").first();
  if (await timer.evaluate((element) => Boolean(element.closest("#recipeList")))) {
    throw new Error("刻限採集のボタンが素材リスト内にありません");
  }
  await timer.focus();
  await save(page, `${prefix}-04-gather-action.webp`);
  await timer.click();
  await save(page, `${prefix}-04-gather-result.webp`, () => expectVisible(page, "#gatheringDialog"));
  await page.close();
}

async function captureMaterialAdjustments(browser, mobile) {
  const prefix = mobile ? "mobile" : "desktop";
  let page = await newPage(browser, mobile);
  await openNormalMaterials(page, "ブラスバスタードソード");
  await save(page, `${prefix}-04-purchase-before.webp`);
  const purchaseNode = page.locator(".intermediate-tree-node").filter({ hasText: "ブラスインゴット" }).first();
  const purchaseShop = purchaseNode.locator(".shop-info-btn");
  await purchaseShop.click();
  const purchase = page.locator('#shopDialog .shop-purchase-option input[type="checkbox"]');
  await purchase.waitFor({ state: "visible" });
  if (await purchase.isDisabled()) throw new Error("ブラスインゴットの購入チェックが無効です");
  if (!(await purchase.getAttribute("aria-label"))?.includes("購入")) throw new Error("ブラスインゴットの購入チェックを判定できません");
  await purchase.focus();
  await save(page, `${prefix}-04-purchase-action.webp`);
  await purchase.check();
  await save(page, `${prefix}-04-purchase-checked.webp`);
  await page.locator("#shopCloseBtn").click();
  await save(page, `${prefix}-04-purchase-result.webp`);
  await page.close();

  page = await newPage(browser, mobile);
  await openNormalMaterials(page, "ブラスバスタードソード");
  await save(page, `${prefix}-04-prepared-before.webp`);
  const preparedNode = page.locator(".intermediate-tree-node").filter({ hasText: "ブラスインゴット" }).first();
  const prepared = preparedNode.locator(".intermediate-prepared-btn");
  await prepared.click();
  await save(page, `${prefix}-04-prepared-dialog.webp`, () => expectVisible(page, "#preparedCountDialog"));
  await page.locator("#preparedCountZeroBtn").click();
  await page.locator("#preparedCountIncreaseBtn").click();
  await save(page, `${prefix}-04-prepared-count.webp`);
  await page.locator("#preparedCountCloseBtn").click();
  await save(page, `${prefix}-04-prepared-result.webp`);
  await page.close();
}

async function captureFavoriteManagement(browser, mobile) {
  const prefix = mobile ? "mobile" : "desktop";
  const page = await newPage(browser, mobile, favoriteSeed("management"));
  await page.locator("#favBtn").click();
  await save(page, `${prefix}-05-favorites-before.webp`);
  let row = page.locator("#favoriteLists li").filter({ hasText: PRIMARY_FAVORITE });
  await row.locator(".favorite-list-curtain-toggle").click();
  await save(page, `${prefix}-05-favorites-actions.webp`);
  await row.locator('[title="名前変更"]').click();
  await save(page, `${prefix}-05-favorites-rename.webp`, () => expectVisible(page, "#textInputDialog"));
  await page.locator("#textInputField").fill("今週の製作");
  await page.locator("#textInputOkBtn").click();
  if (!(await page.locator("#favoriteLists").isVisible())) await page.locator("#favBtn").click();
  await save(page, `${prefix}-05-favorites-renamed.webp`, () => page.locator("#favoriteLists").getByText("今週の製作", { exact: true }).waitFor());
  row = page.locator("#favoriteLists li").filter({ hasText: "今週の製作" });
  if (!(await row.locator(".favorite-list-curtain-actions").isVisible())) await row.locator(".favorite-list-curtain-toggle").click();
  const handle = row.locator(".reorder-handle");
  const target = page.locator("#favoriteLists li").filter({ hasText: SECONDARY_FAVORITE });
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height * 0.7, { steps: 6 });
  await save(page, `${prefix}-05-favorites-reorder.webp`);
  await page.mouse.up();
  await save(page, `${prefix}-05-favorites-reordered.webp`);
  row = page.locator("#favoriteLists li").filter({ hasText: "今週の製作" });
  if (!(await row.locator(".favorite-list-curtain-actions").isVisible())) await row.locator(".favorite-list-curtain-toggle").click();
  await row.locator('[title="削除"]').click();
  await save(page, `${prefix}-05-favorites-delete.webp`, () => expectVisible(page, "#confirmDialog"));
  await page.locator("#confirmYes").click();
  if (!(await page.locator("#favoriteLists").isVisible())) await page.locator("#favBtn").click();
  await save(page, `${prefix}-05-favorites-deleted.webp`);
  await page.close();
}

async function captureFavoriteCalculations(browser, mobile) {
  const prefix = mobile ? "mobile" : "desktop";
  let page = await newPage(browser, mobile, favoriteSeed("primary"));
  await openFavorite(page);
  await save(page, `${prefix}-05-favorite-materials-before.webp`);
  await openFavoriteMaterialOptions(page);
  await save(page, `${prefix}-06-favorite-options.webp`);
  await page.locator(".favorite-material-mode-group").getByText("個数指定").click();
  const countInput = page.locator("#recipeList .favorite-item-count-input").first();
  if (await countInput.count()) await countInput.fill("2");
  await save(page, `${prefix}-06-favorite-count.webp`);
  await page.locator("#recipeList").getByText(/素材リストを表示/).click();
  await assertNoRecipeResolutionNotice(page, `${PRIMARY_FAVORITE}の個数指定計算`);
  await save(page, `${prefix}-06-favorite-count-result.webp`, () => page.locator(".materials-section-header").first().waitFor());
  await page.close();

  page = await newPage(browser, mobile, favoriteSeed("anyItem"));
  await openFavorite(page, ANY_ITEM_FAVORITE);
  await openFavoriteMaterialOptions(page);
  await page.locator(".favorite-material-mode-group").getByText("どれか1アイテム").click();
  await save(page, `${prefix}-06-favorite-any.webp`);
  await page.locator("#recipeList").getByText(/素材リストを表示/).click();
  await assertNoRecipeResolutionNotice(page, `${ANY_ITEM_FAVORITE}のどれか1アイテム計算`);
  await save(page, `${prefix}-06-favorite-any-result.webp`, () => page.locator(".materials-section-header").first().waitFor());
  await page.close();

  page = await newPage(browser, mobile, favoriteSeed("ring"));
  await openFavorite(page, RING_FAVORITE);
  await page.locator("#recipeList").getByText(/素材リストを表示/).click();
  await assertNoRecipeResolutionNotice(page, `${RING_FAVORITE}の指輪数計算`);
  await page.locator(".materials-section-header").first().waitFor();
  const ring = page.locator(".favorite-ring-toggle button").filter({ hasText: "2つ" }).first();
  if (!(await ring.isVisible())) throw new Error(`${RING_FAVORITE}に指輪数の指定がありません`);
  await ring.click();
  await save(page, `${prefix}-06-favorite-ring-result.webp`);
  await page.close();
}

async function captureCombinedFavorites(browser, mobile) {
  const prefix = mobile ? "mobile" : "desktop";
  const page = await newPage(browser, mobile, favoriteSeed("combined"));
  await page.locator("#favBtn").click();
  await save(page, `${prefix}-07-combined-before.webp`);
  for (let index = 0; index < COMBINED_FAVORITES.length; index += 1) {
    const row = page.locator("#favoriteLists li").filter({ hasText: COMBINED_FAVORITES[index] });
    await row.locator(".favorite-list-curtain-toggle").click();
    await row.locator(".favorite-list-material-checkbox").check();
    if (index === 0) await save(page, `${prefix}-07-combined-select-1.webp`);
  }
  await save(page, `${prefix}-07-combined-select-2.webp`);
  await page.locator("#checkedFavoriteMaterialsBtn").focus();
  await save(page, `${prefix}-07-combined-modes.webp`, () => expectVisible(page, "#checkedFavoriteMaterialsActions"));
  await page.locator("#checkedFavoriteMaterialsBtn").click();
  await page.locator(".materials-section-header").first().waitFor();
  await assertNoRecipeResolutionNotice(page, "コートリーラヴァー防具7リストの合算");
  await page.locator("#appTitle").click();
  await page.locator("#favBtn").click();
  for (const name of COMBINED_FAVORITES) {
    const checkbox = page.locator("#favoriteLists li").filter({ hasText: name }).locator(".favorite-list-material-checkbox");
    if (!(await checkbox.isChecked())) await checkbox.check();
  }
  await page.locator("#checkedFavoriteAnyOneModeBtn").click();
  await save(page, `${prefix}-07-combined-any-mode.webp`);
  await page.locator("#checkedFavoriteMaterialsBtn").click();
  await assertNoRecipeResolutionNotice(page, "コートリーラヴァー防具7リストのどれか1リスト計算");
  await save(page, `${prefix}-07-combined-any-result.webp`, () => page.locator(".materials-section-header").first().waitFor());
  await page.close();
}

async function showTextOutput(page, value) {
  await page.setContent(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>html,body{margin:0;min-height:100%;background:#111;color:#f5f0df;font-family:"Yu Gothic UI",Meiryo,sans-serif}main{box-sizing:border-box;min-height:100vh;padding:36px}h1{margin:0 0 22px;color:#d8b95f;font-size:28px}pre{margin:0;padding:24px;border:1px solid #645832;border-radius:12px;background:#1b1a17;white-space:pre-wrap;overflow-wrap:anywhere;font:16px/1.65 "Yu Gothic UI",Meiryo,sans-serif}</style></head><body><main><h1>共有テキストの出力結果</h1><pre></pre></main></body></html>`);
  await page.locator("pre").evaluate((element, text) => { element.textContent = text; }, value);
}

async function latestShareImage(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("xivca-share-png-v1", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise((resolve, reject) => {
      const request = db.transaction("pngs", "readonly").objectStore("pngs").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    const record = records.sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!record?.blob) throw new Error("共有画像が保存されていません");
    const bytes = new Uint8Array(await record.blob.arrayBuffer());
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return btoa(binary);
  });
}

async function showImageOutput(page, base64) {
  await page.setContent(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;background:#111;color:#f5f0df;font-family:"Yu Gothic UI",Meiryo,sans-serif}main{box-sizing:border-box;width:100%;height:100%;padding:24px;display:grid;grid-template-rows:auto 1fr;gap:16px}h1{margin:0;color:#d8b95f;font-size:26px}.output{min-height:0;display:grid;place-items:center}img{display:block;max-width:100%;max-height:100%;object-fit:contain;box-shadow:0 10px 32px #000}</style></head><body><main><h1>共有画像の出力結果</h1><div class="output"><img alt="アプリが生成した共有画像"></div></main></body></html>`);
  await page.locator("img").evaluate((image, source) => { image.src = `data:image/png;base64,${source}`; }, base64);
  await page.locator("img").evaluate((image) => image.decode());
}

async function captureContentSharing(browser, mobile) {
  const prefix = mobile ? "mobile" : "desktop";
  let page = await newPage(browser, mobile);
  await search(page, "ブラスバスタードソード");
  await save(page, `${prefix}-08-share-before.webp`);
  await page.locator("#shareBtn").click();
  await save(page, `${prefix}-08-share-dialog.webp`, () => expectVisible(page, "#contentShareDialog"));
  if (!mobile) await page.locator("#contentSharePanelChoices button:not([disabled])").last().click();
  await save(page, `${prefix}-08-share-panel.webp`);
  await page.locator("#contentShareTextBtn").click();
  const text = await page.evaluate(() => window.__guideSharedText || "");
  if (!text) throw new Error(`${prefix}: 共有テキストを取得できませんでした`);
  await showTextOutput(page, text);
  await save(page, `${prefix}-08-share-text-result.webp`);
  await page.close();
  page = await newPage(browser, mobile);
  await search(page, "ブラスバスタードソード");
  await page.locator("#shareBtn").click();
  if (!mobile) await page.locator("#contentSharePanelChoices button:not([disabled])").last().click();
  await page.locator("#contentShareImageBtn").click();
  await page.locator("#shareReadyBtn").waitFor({ state: "visible", timeout: 120_000 });
  await save(page, `${prefix}-08-share-image-ready.webp`);
  const image = await latestShareImage(page);
  await showImageOutput(page, image);
  await save(page, `${prefix}-08-share-image-result.webp`);
  await page.close();
}

async function captureFavoriteSharing(browser, mobile) {
  const prefix = mobile ? "mobile" : "desktop";
  let page = await newPage(browser, mobile, favoriteSeed("primary"));
  await page.locator("#settingsBtn").click();
  await save(page, `${prefix}-09-code-create-before.webp`, () => expectVisible(page, "#settingsDialog"));
  await page.locator("#exportListToggle").click();
  await save(page, `${prefix}-09-code-list.webp`);
  await page.locator("#exportListChoices").getByText(PRIMARY_FAVORITE, { exact: true }).click();
  await save(page, `${prefix}-09-code-result.webp`, () => page.locator("#exportCode").evaluate((input) => { if (!input.value) throw new Error("シェアコードが空です"); }));
  const code = await page.locator("#exportCode").inputValue();
  await page.close();

  page = await newPage(browser, mobile);
  await page.locator("#settingsBtn").click();
  await save(page, `${prefix}-09-code-import-before.webp`, () => expectVisible(page, "#settingsDialog"));
  await page.locator("#importCode").fill(code);
  await save(page, `${prefix}-09-code-import.webp`);
  await page.locator("#startImportBtn").click();
  await assertNoRecipeResolutionNotice(page, `${PRIMARY_FAVORITE}のシェアコード取り込み`);
  await save(page, `${prefix}-09-code-imported.webp`, () => page.locator("#recipeList li.fav-item-row").first().waitFor());
  await page.close();
}

async function captureSharePlaza(browser, mobile) {
  const prefix = mobile ? "mobile" : "desktop";
  const page = await newPage(browser, mobile, favoriteSeed("primary"));
  await page.locator("#settingsBtn").click();
  await save(page, `${prefix}-09-plaza-before.webp`);
  await page.locator("#sharePlazaOpenBtn").focus();
  await save(page, `${prefix}-09-plaza-action.webp`);
  await page.locator("#sharePlazaOpenBtn").click();
  await page.frameLocator("#sharePlazaFrame").locator(".copy-button").first().waitFor();
  await save(page, `${prefix}-09-plaza-result.webp`);
  await page.close();
}

async function captureFavoriteFile(browser, mobile) {
  const prefix = mobile ? "mobile" : "desktop";
  let page = await newPage(browser, mobile, favoriteSeed("all"));
  await page.locator("#settingsBtn").click();
  await save(page, `${prefix}-09-file-export-before.webp`);
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#exportAllFavoritesBtn").click();
  await downloadPromise;
  await save(page, `${prefix}-09-file-exported.webp`);
  await page.close();

  page = await newPage(browser, mobile, favoriteSeed("primary"));
  await page.locator("#settingsBtn").click();
  await save(page, `${prefix}-09-file-import-before.webp`);
  await page.locator("#importAllFavoritesFile").setInputFiles(favoriteSamplePath);
  await save(page, `${prefix}-09-file-select.webp`, () => expectVisible(page, "#confirmOverlay.favorite-list-file-dialog"));
  const firstCheck = page.locator("#confirmOverlay .favorite-list-file-selection").first();
  await firstCheck.uncheck();
  await save(page, `${prefix}-09-file-selected.webp`);
  await page.locator('#confirmOverlay input[name="favorite-list-file-import-mode"][value="replace"]').check();
  await page.locator("#confirmYes").click();
  await save(page, `${prefix}-09-file-confirm.webp`, () => expectVisible(page, "#confirmOverlay.favorite-list-file-final-confirm"));
  await page.locator("#confirmYes").click();
  await page.locator("#confirmOverlay").waitFor({ state: "hidden" });
  await assertNoRecipeResolutionNotice(page, "19リストファイルの読み込み");
  await save(page, `${prefix}-09-file-result.webp`);
  await page.close();
}

async function captureDisplayAndLayout(browser, mobile) {
  const prefix = mobile ? "mobile" : "desktop";
  let page = await newPage(browser, mobile, favoriteSeed("primary"));
  await page.locator("#settingsBtn").click();
  await save(page, `${prefix}-10-display-before.webp`);
  await page.locator("#settingsDisplayTab").click();
  await save(page, `${prefix}-10-display-open.webp`);
  await page.locator("#fontSizeLevelInput").fill("7");
  await save(page, `${prefix}-10-display-change.webp`);
  await page.locator("#fontSizeApplyBtn").click();
  await save(page, `${prefix}-10-display-result.webp`);
  await page.close();
  if (!mobile) {
    page = await newPage(browser, false);
    await save(page, "desktop-10-panel-before.webp");
    const box = await page.locator("#panelLeftResizeHandle").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 160);
    await page.mouse.down();
    await page.mouse.move(box.x + 100, box.y + 160, { steps: 5 });
    await save(page, "desktop-10-panel-action.webp");
    await page.mouse.up();
    await save(page, "desktop-10-panel-result.webp");
    await page.close();
  }
}

async function capturePopup(browser, mobile) {
  const prefix = mobile ? "mobile" : "desktop";
  const page = await newPage(browser, mobile);
  await save(page, `${prefix}-10-popup-before.webp`);
  await page.locator("#popupBtn").focus();
  await save(page, `${prefix}-10-popup-action.webp`);
  const popupPromise = page.context().waitForEvent("page");
  await page.locator("#popupBtn").click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await popup.setViewportSize({ width: 601, height: 498 });
  await popup.locator("#loadingOverlay").waitFor({ state: "hidden" });
  await save(popup, `${prefix}-10-popup-result.webp`);
  await popup.close();
  await page.close();
}

async function captureAllForViewport(browser, mobile) {
  console.log(`${mobile ? "mobile" : "desktop"}: 撮影開始`);
  await captureSearchAndMaterials(browser, mobile);
  console.log(`${mobile ? "mobile" : "desktop"}: 基本操作完了`);
  await captureReverseAndHome(browser, mobile);
  await captureEquipment(browser, mobile);
  await captureCraftMethod(browser, mobile);
  await captureShopAndGathering(browser, mobile);
  await captureMaterialAdjustments(browser, mobile);
  await captureFavoriteManagement(browser, mobile);
  await captureFavoriteCalculations(browser, mobile);
  await captureCombinedFavorites(browser, mobile);
  await captureContentSharing(browser, mobile);
  await captureFavoriteSharing(browser, mobile);
  await captureSharePlaza(browser, mobile);
  await captureFavoriteFile(browser, mobile);
  await captureDisplayAndLayout(browser, mobile);
  if (!mobile) await capturePopup(browser, mobile);
  console.log(`${mobile ? "mobile" : "desktop"}: 撮影完了`);
}

async function verifyReferences() {
  const slides = await readFile(path.join(guideRoot, "src", "guide", "assets", "guide-slides.js"), "utf8");
  const references = [...slides.matchAll(/["']([^"']+\.webp)["']/g)].map((match) => match[1]);
  const referenceSet = new Set(references);
  const missing = [...referenceSet].filter((name) => !generated.has(name));
  const unused = [...generated].filter((name) => !referenceSet.has(name));
  if (missing.length) throw new Error(`未生成のガイド画像: ${missing.join(", ")}`);
  if (unused.length) throw new Error(`未参照のガイド画像: ${unused.join(", ")}`);
  const files = (await readdir(stagingRoot)).filter((name) => name.endsWith(".webp"));
  if (files.length !== generated.size) throw new Error(`生成画像数が一致しません: files=${files.length}, manifest=${generated.size}`);
}

async function replaceImages() {
  const output = path.resolve(imageRoot);
  const staging = path.resolve(stagingRoot);
  const expectedParent = path.resolve(guideRoot, "src", "guide", "assets");
  if (path.dirname(output) !== expectedParent || path.dirname(staging) !== expectedParent) throw new Error("画像置換先がガイド資産ディレクトリ外です");
  await rm(output, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  await mkdir(output, { recursive: true });
  for (const name of await readdir(staging)) {
    if (!name.endsWith(".webp")) continue;
    await copyFile(path.join(staging, name), path.join(output, name));
  }
  await rm(staging, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}

try {
  await rm(stagingRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  await mkdir(stagingRoot, { recursive: true });
  await Promise.all([
    waitForServer("http://127.0.0.1:4173/"),
    waitForServer("http://127.0.0.1:4174/share-code-plaza.html"),
  ]);
  const browser = await chromium.launch();
  try {
    await prepareFavoriteSeeds(browser);
    await captureAllForViewport(browser, false);
    await captureAllForViewport(browser, true);
  } finally {
    await browser.close();
  }
  await verifyReferences();
  await replaceImages();
  console.log(`ガイド画像を${generated.size}枚生成しました: ${imageRoot}`);
} catch (error) {
  console.error(`撮影失敗。一時画像は調査用に保持します: ${stagingRoot}`);
  throw error;
} finally {
  stopServer(appServer);
  stopServer(guideServer);
}
