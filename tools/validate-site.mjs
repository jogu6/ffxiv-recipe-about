import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const siteRoot = path.join(repositoryRoot, 'docs');

function requireFile(relativePath) {
  const absolutePath = path.join(siteRoot, relativePath);
  if (!fs.existsSync(absolutePath)) throw new Error(`Missing site file: ${relativePath}`);
  return absolutePath;
}

function requireRepoFile(relativePath) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  if (!fs.existsSync(absolutePath)) throw new Error(`Missing repository file: ${relativePath}`);
  return absolutePath;
}

for (const relativePath of [
  'index.html',
  'robots.txt',
  'sitemap.xml',
  'assets/app.js',
  'assets/styles.css',
  'assets/app-icons/favicon.png'
]) {
  requireFile(relativePath);
}

for (const relativePath of [
  'tools/export-discord.ps1',
  'src/app.js',
  'src/styles.css',
  'src/site-template.html',
  'config.example.json'
]) {
  requireRepoFile(relativePath);
}

const html = fs.readFileSync(requireFile('index.html'), 'utf8');
const robots = fs.readFileSync(requireFile('robots.txt'), 'utf8');
const sitemap = fs.readFileSync(requireFile('sitemap.xml'), 'utf8');
const appJs = fs.readFileSync(requireFile('assets/app.js'), 'utf8');
const styles = fs.readFileSync(requireFile('assets/styles.css'), 'utf8');
JSON.parse(fs.readFileSync(requireRepoFile('config.example.json'), 'utf8'));

const requiredHtml = [
  '<link rel="icon" href="assets/app-icons/favicon.png" type="image/png">',
  '<meta name="description"',
  '<meta name="robots" content="index, follow">',
  '<link rel="canonical" href="https://jogu6.github.io/ffxiv-recipe-about/">',
  '<meta property="og:title"',
  '<script type="application/ld+json">',
  '<script src="assets/app.js"></script>',
  'class="image-viewer"',
  'class="top-button"'
];
for (const snippet of requiredHtml) {
  if (!html.includes(snippet)) throw new Error(`index.html is missing: ${snippet}`);
}

if (html.includes('site-header') || html.includes('site-nav')) {
  throw new Error('index.html should not include the removed Home header.');
}

if (!html.includes('target="_blank" rel="noopener noreferrer"')) {
  throw new Error('index.html should include linked URLs with safe external-link attributes.');
}

if (!robots.includes('User-agent: *') || !robots.includes('Sitemap: https://jogu6.github.io/ffxiv-recipe-about/sitemap.xml')) {
  throw new Error('robots.txt is missing crawl or sitemap directives.');
}

if (!sitemap.includes('<loc>https://jogu6.github.io/ffxiv-recipe-about/</loc>')) {
  throw new Error('sitemap.xml is missing the canonical site URL.');
}

if (!appJs.includes('setupImageGalleries') || !appJs.includes('ResizeObserver')) {
  throw new Error('assets/app.js is missing gallery or image-size behavior.');
}

if (!styles.includes('.gallery-dot.active') || !styles.includes('.image-viewer-close')) {
  throw new Error('assets/styles.css is missing gallery or viewer styles.');
}

const imageSources = [...html.matchAll(/<img src="([^"]+)"/g)].map(match => match[1]);
const missingImages = imageSources.filter(source => !fs.existsSync(path.join(siteRoot, source)));
if (missingImages.length > 0) {
  throw new Error(`Missing referenced image: ${missingImages[0]}`);
}

const groupedByMessageId = new Map();
for (const source of imageSources) {
  const fileName = path.basename(source);
  const messageId = fileName.split('-')[0];
  if (!groupedByMessageId.has(messageId)) groupedByMessageId.set(messageId, new Set());
  groupedByMessageId.get(messageId).add(source);
}

for (const [messageId, sources] of groupedByMessageId) {
  const matchingFrames = [...html.matchAll(new RegExp(`${messageId}[^\"]+`, 'g'))];
  if (matchingFrames.length > 1 && sources.size !== matchingFrames.length) {
    throw new Error(`Image filenames for message ${messageId} may not be unique.`);
  }
}

const ps1Bytes = fs.readFileSync(requireRepoFile('tools/export-discord.ps1'));
if (ps1Bytes.length < 3 || ps1Bytes[0] !== 0xef || ps1Bytes[1] !== 0xbb || ps1Bytes[2] !== 0xbf) {
  throw new Error('tools/export-discord.ps1 must be UTF-8 with BOM.');
}

console.log(`Validated ${imageSources.length} rendered images and ${groupedByMessageId.size} message image groups.`);

