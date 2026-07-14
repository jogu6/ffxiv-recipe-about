import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(repositoryRoot, 'src', 'guide');
const siteRoot = path.join(repositoryRoot, 'docs');
const sourceAssets = path.join(sourceRoot, 'assets');
const siteAssets = path.join(siteRoot, 'assets');

function assertInside(parent, target) {
  const relativePath = path.relative(parent, target);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Refusing to modify path outside the expected directory: ${target}`);
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

for (const requiredPath of [
  path.join(sourceRoot, 'index.html'),
  sourceAssets,
  siteRoot,
]) {
  if (!fs.existsSync(requiredPath)) throw new Error(`Missing required path: ${requiredPath}`);
}

assertInside(repositoryRoot, sourceRoot);
assertInside(repositoryRoot, siteRoot);
assertInside(siteRoot, siteAssets);

fs.copyFileSync(path.join(sourceRoot, 'index.html'), path.join(siteRoot, 'index.html'));
fs.rmSync(siteAssets, { recursive: true, force: true });
fs.cpSync(sourceAssets, siteAssets, { recursive: true });

const sourceFiles = listFiles(sourceRoot).sort();
const publishedFiles = [
  'index.html',
  ...listFiles(siteAssets).map((file) => `assets/${file}`),
].sort();

if (JSON.stringify(sourceFiles) !== JSON.stringify(publishedFiles)) {
  throw new Error('Published guide file list does not match src/guide.');
}

for (const relativePath of sourceFiles) {
  const sourceHash = digest(path.join(sourceRoot, relativePath));
  const publishedHash = digest(path.join(siteRoot, relativePath));
  if (sourceHash !== publishedHash) {
    throw new Error(`Published file differs from source: ${relativePath}`);
  }
}

console.log(`Published ${sourceFiles.length} guide files from src/guide to docs.`);
