import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const markerPrefix = '【シェアコード広場Bot】';
const defaultPublicUrl = 'https://jogu6.github.io/ffxiv-recipe-about/share-code-plaza.html';
const defaultItemDataUrl = 'https://jogu6.github.io/ffxiv-recipe/data/Item.json';

function readArgs(argv) {
  const result = { publish: true, replies: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--no-publish') result.publish = false;
    else if (arg === '--no-replies') result.replies = false;
    else if (arg.startsWith('--')) result[arg.slice(2)] = argv[++i];
  }
  return result;
}

function readJson(filePath, required = true) {
  if (!fs.existsSync(filePath)) {
    if (!required) return {};
    throw new Error(`File not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadConfig(args) {
  const base = readJson(path.join(root, 'config.local.json'), false);
  const localPath = path.resolve(root, args.config || 'share-code-plaza.local.json');
  const merged = { ...base, ...readJson(localPath, false) };
  const monitorConfig = readJson(
    path.resolve(root, '..', 'ffxiv-recipe', 'pipeline', 'config', 'xivapi-monitor.local.json'),
    false,
  );
  return {
    ...merged,
    discordWebhookUrl: merged.discordWebhookUrl || monitorConfig.discordWebhookUrl || '',
    publicUrl: merged.publicUrl || defaultPublicUrl,
    itemDataUrl: merged.itemDataUrl || defaultItemDataUrl,
  };
}

async function request(url, options = {}) {
  for (;;) {
    const response = await fetch(url, options);
    if (response.status !== 429) return response;
    const body = await response.json().catch(() => ({}));
    const delay = Math.max(1000, Number(body.retry_after || 1) * 1000);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

function discordHeaders(token) {
  return { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' };
}

async function fetchDiscordMessages(config) {
  if (!config.botToken || !config.channelId) throw new Error('botToken and channelId are required');
  const messages = [];
  let before = '';
  for (;;) {
    const query = new URLSearchParams({ limit: '100' });
    if (before) query.set('before', before);
    const response = await request(
      `https://discord.com/api/v10/channels/${config.channelId}/messages?${query}`,
      { headers: discordHeaders(config.botToken) },
    );
    if (!response.ok) throw new Error(`Discord message fetch failed: ${response.status}`);
    const batch = await response.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    messages.push(...batch);
    before = batch.at(-1).id;
    if (batch.length < 100) break;
  }
  return messages;
}

function decodeShareCode(code) {
  const upper = String(code).toUpperCase();
  if (!/^Z[0-9A-Z]+$/.test(upper) || upper.length < 5) throw new Error('形式が正しくありません');
  const byteLength = Number.parseInt(upper.slice(1, 5), 36);
  if (!Number.isInteger(byteLength) || upper.length !== 5 + byteLength * 2) {
    throw new Error('コード長が正しくありません');
  }
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i += 1) {
    const value = Number.parseInt(upper.slice(5 + i * 2, 7 + i * 2), 36);
    if (!Number.isInteger(value) || value < 0 || value > 255) throw new Error('文字列を復号できません');
    bytes[i] = value;
  }
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('内容を復号できません');
  }
  if (typeof payload.n !== 'string' || !Array.isArray(payload.i) || payload.i.length === 0) {
    throw new Error('リスト情報がありません');
  }
  const itemIds = [...new Set(payload.i.map(Number))];
  if (itemIds.some((id) => !Number.isInteger(id) || id <= 0)) throw new Error('アイテムIDが正しくありません');
  return { code: upper, name: payload.n.trim().slice(0, 50), itemIds };
}

function extractCandidates(content) {
  return [...String(content || '').matchAll(/(?:^|[^0-9A-Z])(Z[0-9A-Z]+)/gi)].map((match) => match[1]);
}

function indexItems(rawItems) {
  const map = new Map();
  for (const item of rawItems) {
    const id = Number(item.ID ?? item.Id ?? item.id);
    if (Number.isInteger(id) && id > 0) map.set(id, item);
  }
  return map;
}

function analyzeMessages(messages, itemMap, botId = '') {
  const records = [];
  const results = new Map();
  for (const message of messages) {
    if (message.author?.id === botId || message.webhook_id) continue;
    const candidates = extractCandidates(message.content);
    if (candidates.length === 0) continue;
    const result = { valid: [], invalid: [] };
    candidates.forEach((candidate, index) => {
      try {
        const decoded = decodeShareCode(candidate);
        const missing = decoded.itemIds.filter((id) => !itemMap.has(id));
        if (missing.length > 0) throw new Error(`未登録のアイテムIDが含まれています（${missing.join(', ')}）`);
        const items = decoded.itemIds.map((id) => {
          const item = itemMap.get(id);
          return { id, name: String(item.Name || id), iconFile: String(item.IconFile || '') };
        });
        const record = {
          ...decoded,
          items,
          messageId: String(message.id),
          timestamp: message.timestamp,
          editedTimestamp: message.edited_timestamp || null,
        };
        result.valid.push(record);
        records.push(record);
      } catch (error) {
        result.invalid.push({ index: index + 1, reason: error.message });
      }
    });
    results.set(String(message.id), result);
  }
  const counts = new Map();
  records.forEach((record) => counts.set(record.code, (counts.get(record.code) || 0) + 1));
  records.forEach((record) => { record.duplicate = counts.get(record.code) > 1; });
  records.sort((a, b) => {
    const aTime = Date.parse(a.editedTimestamp || a.timestamp);
    const bTime = Date.parse(b.editedTimestamp || b.timestamp);
    return bTime - aTime || b.messageId.localeCompare(a.messageId);
  });
  return { records, results };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function formatDate(value) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(value));
}

function iconUrl(iconFile) {
  if (!iconFile) return '';
  return `https://jogu6.github.io/ffxiv-recipe/assets/item-icons/${iconFile.slice(0, 3)}/${encodeURIComponent(iconFile)}`;
}

function renderHtml(records, sourceLabel) {
  const cards = records.map((record) => {
    const items = record.items.map((item) => {
      const icon = iconUrl(item.iconFile);
      return `<li>${icon ? `<img src="${escapeHtml(icon)}" alt="" loading="lazy" onerror="this.hidden=true">` : ''}<span>${escapeHtml(item.name)}</span></li>`;
    }).join('');
    return `<article class="share-card">
      <header><h2>${escapeHtml(record.name)}</h2><time datetime="${escapeHtml(record.editedTimestamp || record.timestamp)}">${escapeHtml(formatDate(record.editedTimestamp || record.timestamp))}</time></header>
      <ul class="item-list">${items}</ul>
      <button class="import-button" type="button" data-code="${escapeHtml(record.code)}">シェアコードを取り込む</button>
      <p class="import-result" aria-live="polite"></p>
    </article>`;
  }).join('\n');
  const body = cards || '<p class="empty">現在掲載されているシェアコードはありません。</p>';
  const html = `<!doctype html>
<html lang="ja" data-generation-id="__GENERATION_ID__" data-entry-count="${records.length}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><title>シェアコード広場</title>
<style>
:root{color-scheme:dark;--bg:#151515;--surface:#202020;--surface2:#282828;--border:#444;--text:#eee;--muted:#aaa;--accent:#d8b45a;--danger:#d77}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif}body{padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(42px,calc(env(safe-area-inset-bottom) + 26px)) max(12px,env(safe-area-inset-left))}.page{width:min(920px,100%);margin:auto}.top{position:sticky;top:0;z-index:2;margin:-12px -4px 14px;padding:12px 4px;background:linear-gradient(var(--bg) 82%,transparent)}.title-row{display:flex;align-items:center;justify-content:space-between;gap:12px}.title-actions{display:flex;align-items:center;gap:7px}h1{margin:0;color:var(--accent);font-size:20px}.license-button{border:1px solid var(--border);border-radius:3px;background:var(--bg);color:var(--muted);padding:3px 7px;font-size:10px;cursor:pointer}.close-button,.import-button{border:1px solid var(--border);border-radius:5px;background:#292929;color:var(--text);padding:8px 14px;cursor:pointer}.close-button:hover,.import-button:hover,.license-button:hover{border-color:var(--accent);color:var(--accent)}.description{margin:10px 0 0;color:var(--muted);font-size:13px;line-height:1.7}.share-list{display:grid;gap:12px}.share-card{min-width:0;padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:7px}.share-card header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:10px}.share-card h2{min-width:0;margin:0;color:var(--accent);font-size:17px;overflow-wrap:anywhere}.share-card time{flex:none;color:var(--muted);font-size:12px}.item-list{display:flex;flex-wrap:wrap;align-items:flex-start;gap:6px;margin:0 0 12px;padding:0;list-style:none}.item-list li{display:flex;flex:0 1 116px;flex-direction:column;align-items:center;gap:5px;min-width:72px;padding:7px 5px;background:var(--surface2);border-radius:4px;font-size:12px;text-align:center}.item-list img{width:40px;height:40px;flex:none;border-radius:3px}.item-list span{width:100%;overflow-wrap:anywhere}.import-button{width:100%;background:#302b1e;border-color:#665832}.import-result{min-height:1.2em;margin:7px 0 0;color:var(--accent);font-size:12px;text-align:center}.empty{padding:30px;text-align:center;color:var(--muted)}footer{position:fixed;right:0;bottom:0;left:0;z-index:20;padding:4px;background:transparent;color:#888;text-align:center;font-size:11px}footer a{color:var(--accent)}#licenseOverlay{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.76)}#licenseOverlay.open{display:flex}#licenseDialog{width:min(640px,100%);padding:20px 24px;border:1px solid var(--border);border-radius:6px;background:var(--surface)}#licenseDialog h2{margin-top:0;color:var(--accent);font-size:14px}#licenseText{padding:12px;border:1px solid var(--border);background:var(--bg);color:var(--muted);font-size:12px;line-height:1.6}.license-close{display:block;margin:14px auto 0;padding:6px 18px;border:1px solid var(--border);border-radius:4px;background:var(--surface2);color:var(--text);cursor:pointer}
@media(max-width:600px){body{padding-left:8px;padding-right:8px}.top{margin-left:0;margin-right:0}.title-row{align-items:center}h1{font-size:17px}.close-button{padding:7px 11px}.share-card{padding:10px}.share-card header{display:block}.share-card time{display:block;margin-top:4px}.item-list li{flex-basis:92px}.item-list img{width:44px;height:44px}}
</style></head>
<body><main class="page"><section class="top"><div class="title-row"><h1>シェアコード広場</h1><div class="title-actions"><button class="license-button" id="licenseBtn" type="button">LICENSE</button><button id="closeButton" class="close-button" type="button">閉じる</button></div></div><p class="description">このページは、${escapeHtml(sourceLabel)}へ投稿されたシェアコードを転記したものです。掲載内容は定期的に更新されます。</p></section><section class="share-list">${body}</section></main>
<div id="licenseOverlay" aria-hidden="true"><div id="licenseDialog" role="dialog" aria-modal="true" aria-labelledby="licenseTitle"><h2 id="licenseTitle">LICENSE / NOTICE</h2><div id="licenseText"><p>The MIT License applies only to the original application source code and project tooling in this repository.</p><p>FINAL FANTASY XIV images, names, item and recipe data, trademarks, and other game-derived materials are owned by SQUARE ENIX.</p><p>This project is unofficial and is not affiliated with, sponsored by, approved by, or endorsed by SQUARE ENIX.</p></div><button class="license-close" id="licenseCloseBtn" type="button">閉じる</button></div></div>
<footer>© SQUARE ENIX / Data: XIVAPI / X: <a href="https://x.com/ff14_recipe" target="_blank" rel="noopener">@ff14_recipe</a></footer>
<script>
const closeButton=document.querySelector('#closeButton');
const licenseOverlay=document.querySelector('#licenseOverlay');
closeButton.addEventListener('click',()=>{if(window.parent!==window)window.parent.postMessage({type:'ffxiv-share-code-plaza-close'},'*')});
document.querySelector('#licenseBtn').addEventListener('click',()=>{licenseOverlay.classList.add('open');licenseOverlay.setAttribute('aria-hidden','false')});
document.querySelector('#licenseCloseBtn').addEventListener('click',()=>{licenseOverlay.classList.remove('open');licenseOverlay.setAttribute('aria-hidden','true')});
licenseOverlay.addEventListener('click',event=>{if(event.target===licenseOverlay)document.querySelector('#licenseCloseBtn').click()});
document.addEventListener('click',event=>{const button=event.target.closest('.import-button');if(!button||window.parent===window)return;button.closest('.share-card').querySelector('.import-result').textContent='';window.parent.postMessage({type:'ffxiv-share-code-import',code:button.dataset.code},'*')});
window.addEventListener('message',event=>{if(!event.data||event.data.type!=='ffxiv-share-code-imported')return;const active=document.activeElement?.closest?.('.share-card');const result=active?.querySelector('.import-result');if(result)result.textContent='「'+event.data.listName+'」を保存しました';});
</script></body></html>`;
  const generationId = crypto.createHash('sha256').update(html).digest('hex');
  return html.replace('__GENERATION_ID__', generationId);
}

function splitReply(lines) {
  const chunks = [];
  let current = markerPrefix;
  for (const line of lines) {
    if (`${current}\n${line}`.length > 2000) {
      chunks.push(current);
      current = `${markerPrefix}\n${line}`;
    } else current += `\n${line}`;
  }
  chunks.push(current);
  return chunks;
}

function desiredReplies(results) {
  const desired = new Map();
  for (const [messageId, result] of results) {
    const lines = [];
    if (result.valid.length > 0) {
      lines.push('シェアコード広場へ掲載しました。');
      result.valid.forEach((record) => lines.push(`・${record.name || '名称なし'}${record.duplicate ? '（重複）' : ''}`));
    }
    if (result.invalid.length > 0) {
      lines.push('次のシェアコードは無効なため掲載できませんでした。');
      result.invalid.forEach((invalid) => lines.push(`・${invalid.index}件目: ${invalid.reason}`));
    }
    if (lines.length > 0) desired.set(messageId, splitReply(lines));
  }
  return desired;
}

async function discordMutation(config, method, endpoint, body) {
  const response = await request(`https://discord.com/api/v10${endpoint}`, {
    method, headers: discordHeaders(config.botToken),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`Discord ${method} failed: ${response.status}`);
  return response.status === 204 ? null : response.json();
}

async function reconcileReplies(config, messages, botId, results) {
  const desired = desiredReplies(results);
  const existing = new Map();
  for (const message of messages) {
    if (message.author?.id !== botId || !String(message.content || '').startsWith(markerPrefix)) continue;
    const parentId = message.message_reference?.message_id;
    if (!parentId) continue;
    if (!existing.has(parentId)) existing.set(parentId, []);
    existing.get(parentId).push(message);
  }
  for (const replies of existing.values()) replies.sort((a, b) => a.id.localeCompare(b.id));
  for (const [parentId, replies] of existing) {
    if (desired.has(parentId)) continue;
    for (const reply of replies) {
      await discordMutation(config, 'DELETE', `/channels/${config.channelId}/messages/${reply.id}`);
    }
  }
  for (const [parentId, chunks] of desired) {
    const replies = existing.get(parentId) || [];
    for (let i = 0; i < chunks.length; i += 1) {
      if (replies[i]) {
        if (replies[i].content !== chunks[i]) {
          await discordMutation(config, 'PATCH', `/channels/${config.channelId}/messages/${replies[i].id}`, { content: chunks[i], allowed_mentions: { parse: [] } });
        }
      } else {
        await discordMutation(config, 'POST', `/channels/${config.channelId}/messages`, {
          content: chunks[i], allowed_mentions: { parse: [] },
          message_reference: { message_id: parentId, fail_if_not_exists: true },
        });
      }
    }
    for (const extra of replies.slice(chunks.length)) {
      await discordMutation(config, 'DELETE', `/channels/${config.channelId}/messages/${extra.id}`);
    }
  }
}

function runGit(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout.trim();
}

async function verifyPublished(publicUrl, generationId) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const separator = publicUrl.includes('?') ? '&' : '?';
    const response = await fetch(`${publicUrl}${separator}generation=${generationId}`, { cache: 'no-store' }).catch(() => null);
    const html = response?.ok ? await response.text() : '';
    if (html.includes(`data-generation-id="${generationId}"`)) return;
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }
  throw new Error('GitHub Pagesへの反映を確認できませんでした');
}

async function postWebhook(url, content) {
  if (!url) return;
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
  if (!response.ok) throw new Error(`Discord webhook failed: ${response.status}`);
}

function entryCount(html) {
  return Number(html.match(/data-entry-count="(\d+)"/)?.[1] || 0);
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const config = loadConfig(args);
  const outputPath = path.resolve(root, args.output || 'docs/share-code-plaza.html');
  const publishedPrevious = args.publish
    ? await fetch(config.publicUrl, { cache: 'no-store' }).then((response) => response.ok ? response.text() : '').catch(() => '')
    : '';
  let messages;
  let botId = '';
  if (args.messages) messages = readJson(path.resolve(args.messages));
  else {
    const meResponse = await request('https://discord.com/api/v10/users/@me', { headers: discordHeaders(config.botToken) });
    if (!meResponse.ok) throw new Error(`Discord bot authentication failed: ${meResponse.status}`);
    botId = String((await meResponse.json()).id);
    messages = await fetchDiscordMessages(config);
  }
  const rawItems = args.items
    ? readJson(path.resolve(args.items))
    : await request(config.itemDataUrl, { cache: 'no-store' }).then((response) => {
      if (!response.ok) throw new Error(`Item.json fetch failed: ${response.status}`);
      return response.json();
    });
  const { records, results } = analyzeMessages(messages, indexItems(rawItems), botId);
  const html = renderHtml(records, config.discordSourceLabel || 'Discord「FF14レシピ素材ツリー」のテキストチャンネル「シェアコード広場」');
  const previous = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  const changed = previous !== html;
  if (changed) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const tempPath = `${outputPath}.tmp`;
    fs.writeFileSync(tempPath, html, 'utf8');
    if (!fs.readFileSync(tempPath, 'utf8').includes('</html>')) throw new Error('Generated HTML validation failed');
    fs.renameSync(tempPath, outputPath);
  }
  const generationId = html.match(/data-generation-id="([a-f0-9]+)"/)?.[1];
  const relativeOutputPath = path.relative(root, outputPath);
  const unpublished = args.publish && Boolean(runGit(['status', '--porcelain', '--', relativeOutputPath]));
  const unpushed = args.publish && Number(runGit(['rev-list', '--count', '@{upstream}..HEAD'])) > 0;
  if (args.publish && (changed || unpublished || unpushed)) {
    if (unpublished) {
      runGit(['add', '--', relativeOutputPath]);
      runGit(['commit', '-m', `Update share code plaza (${records.length} entries)`, '--', relativeOutputPath]);
    }
    runGit(['push', 'origin', 'main']);
    await verifyPublished(config.publicUrl, generationId);
  }
  if (args.replies && !args.messages) await reconcileReplies(config, messages, botId, results);
  const previousPublishedCount = entryCount(publishedPrevious);
  if (args.publish && records.length > previousPublishedCount) {
    await postWebhook(config.discordWebhookUrl, `**シェアコード広場 更新完了**\n掲載件数: ${records.length}件（前回: ${previousPublishedCount}件）`);
  }
  console.log(`Share code plaza: ${records.length} entries, ${changed ? 'updated' : 'unchanged'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  let configForError = {};
  try {
    configForError = loadConfig(readArgs(process.argv.slice(2)));
    await main();
  } catch (error) {
    try { await postWebhook(configForError.discordWebhookUrl, `**シェアコード広場 更新失敗**\n${error.message}`); } catch {}
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

export { analyzeMessages, decodeShareCode, extractCandidates, indexItems, renderHtml };
