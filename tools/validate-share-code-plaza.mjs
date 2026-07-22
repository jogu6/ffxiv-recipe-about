import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const file = path.join(root, 'docs', 'share-code-plaza.html');
if (!fs.existsSync(file)) throw new Error('Missing docs/share-code-plaza.html');
const html = fs.readFileSync(file, 'utf8');
for (const snippet of ['data-generation-id=', 'data-entry-count=', 'シェアコード広場', 'ffxiv-share-code-import', 'ffxiv-share-code-plaza-close', 'copy-button', 'シェアコードをコピー', 'LICENSE / NOTICE', '© SQUARE ENIX / Data: XIVAPI']) {
  if (!html.includes(snippet)) throw new Error(`share-code-plaza.html is missing: ${snippet}`);
}
console.log('Validated share-code-plaza.html.');

const taskXmlPath = path.join(root, 'tools', 'share-code-plaza-task.xml');
const taskRunnerPath = path.join(root, 'tools', 'run-share-code-plaza.vbs');
const updateScriptPath = path.join(root, 'tools', 'update-share-code-plaza.ps1');
for (const requiredPath of [updateScriptPath]) {
  if (!fs.existsSync(requiredPath)) throw new Error(`Missing task file: ${path.relative(root, requiredPath)}`);
}
const hasTaskXml = fs.existsSync(taskXmlPath);
const hasTaskRunner = fs.existsSync(taskRunnerPath);
if (hasTaskXml !== hasTaskRunner) {
  throw new Error('Machine-local task XML and VBScript wrapper must either both exist or both be absent.');
}
if (hasTaskXml) {
  const taskBytes = fs.readFileSync(taskXmlPath);
  if (taskBytes[0] !== 0xff || taskBytes[1] !== 0xfe) throw new Error('Task XML must be UTF-16 LE with BOM.');
  const taskXml = taskBytes.subarray(2).toString('utf16le');
  for (const snippet of ['2026-07-15T04:00:00', 'run-share-code-plaza.vbs', '<ExecutionTimeLimit>PT15M</ExecutionTimeLimit>']) {
    if (!taskXml.includes(snippet)) throw new Error(`Task XML is missing: ${snippet}`);
  }
}
const scriptBytes = fs.readFileSync(updateScriptPath);
if (scriptBytes[0] !== 0xef || scriptBytes[1] !== 0xbb || scriptBytes[2] !== 0xbf) {
  throw new Error('PowerShell task script must be UTF-8 with BOM.');
}
console.log('Validated share code plaza task files.');
