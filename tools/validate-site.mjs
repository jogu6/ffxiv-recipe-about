import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(repositoryRoot, 'src', 'guide');
const siteRoot = path.join(repositoryRoot, 'docs');

function requireFile(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.statSync(absolutePath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Missing file: ${path.relative(repositoryRoot, absolutePath)}`);
  }
  return absolutePath;
}

function requireSnippet(content, snippet, fileName) {
  if (!content.includes(snippet)) {
    throw new Error(`${fileName} is missing: ${snippet}`);
  }
}

function listFiles(root, directory = root) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? listFiles(root, absolutePath)
      : [path.relative(root, absolutePath).replaceAll('\\', '/')];
  });
}

function digest(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

for (const relativePath of [
  'index.html',
  'assets/guide.css',
  'assets/guide-features.css',
  'assets/guide.js',
  'assets/app-icons/favicon.png',
  'assets/vendor/swiper-bundle.min.css',
  'assets/vendor/swiper-bundle.min.js',
]) {
  requireFile(sourceRoot, relativePath);
  requireFile(siteRoot, relativePath);
}

for (const relativePath of ['robots.txt', 'sitemap.xml']) {
  requireFile(siteRoot, relativePath);
}

const html = fs.readFileSync(requireFile(siteRoot, 'index.html'), 'utf8');
const guideJs = fs.readFileSync(requireFile(siteRoot, 'assets/guide.js'), 'utf8');
const robots = fs.readFileSync(requireFile(siteRoot, 'robots.txt'), 'utf8');
const sitemap = fs.readFileSync(requireFile(siteRoot, 'sitemap.xml'), 'utf8');

for (const snippet of [
  '<html lang="ja">',
  '<title>FF14 レシピ素材ツリー｜使い方ガイド</title>',
  '<meta name="robots" content="index, follow, max-image-preview:large" />',
  '<link rel="canonical" href="https://jogu6.github.io/ffxiv-recipe-about/" />',
  '<meta property="og:title"',
  '<meta property="og:url" content="https://jogu6.github.io/ffxiv-recipe-about/" />',
  '<meta name="twitter:card" content="summary" />',
  'name="twitter:image"',
  '<script type="application/ld+json">',
  '"@type": "WebPage"',
  'href="https://jogu6.github.io/ffxiv-recipe/"',
  'id="overview"',
  'id="search"',
  'id="equipment"',
  'id="recipe-tree"',
  'id="materials"',
  'id="favorites"',
  'id="combined"',
  'id="share"',
  'class="image-viewer"',
  '<script src="assets/vendor/swiper-bundle.min.js"></script>',
  '<script src="assets/guide.js"></script>',
]) {
  requireSnippet(html, snippet, 'docs/index.html');
}

for (const snippet of ['new Swiper(', 'rebuildResponsiveGalleries', 'openViewer', 'ResizeObserver']) {
  requireSnippet(guideJs, snippet, 'docs/assets/guide.js');
}

const localReferences = [
  ...html.matchAll(/(?:href|src|data-mobile-src)="([^"]+)"/g),
].map((match) => match[1]).filter((reference) => !/^(?:#|https?:\/\/)/.test(reference));

const missingReferences = [...new Set(localReferences)].filter((reference) => {
  const cleanReference = reference.split(/[?#]/, 1)[0];
  return !fs.existsSync(path.resolve(siteRoot, cleanReference));
});
if (missingReferences.length > 0) {
  throw new Error(`Missing referenced file: ${missingReferences[0]}`);
}

const sourceFiles = listFiles(sourceRoot).sort();
const publishedFiles = listFiles(siteRoot)
  .filter((file) => file === 'index.html' || file.startsWith('assets/'))
  .sort();
if (JSON.stringify(sourceFiles) !== JSON.stringify(publishedFiles)) {
  throw new Error('src/guide and the published guide contain different file lists.');
}
for (const relativePath of sourceFiles) {
  if (digest(path.join(sourceRoot, relativePath)) !== digest(path.join(siteRoot, relativePath))) {
    throw new Error(`Published file differs from source: ${relativePath}`);
  }
}

requireSnippet(robots, 'Sitemap: https://jogu6.github.io/ffxiv-recipe-about/sitemap.xml', 'docs/robots.txt');
requireSnippet(sitemap, '<loc>https://jogu6.github.io/ffxiv-recipe-about/</loc>', 'docs/sitemap.xml');
requireSnippet(sitemap, '<lastmod>2026-07-14</lastmod>', 'docs/sitemap.xml');

const imageCount = sourceFiles.filter((file) => file.startsWith('assets/images/')).length;
console.log(`Validated ${sourceFiles.length} guide files, ${imageCount} images, and ${new Set(localReferences).size} local references.`);
