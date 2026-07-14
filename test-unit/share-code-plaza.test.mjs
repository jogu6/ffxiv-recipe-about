import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeMessages, decodeShareCode, extractCandidates, indexItems, renderHtml } from '../tools/share-code-plaza.mjs';

function encode(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return `Z${bytes.length.toString(36).toUpperCase().padStart(4, '0')}${[...bytes].map((byte) => byte.toString(36).toUpperCase().padStart(2, '0')).join('')}`;
}

test('extracts current share codes and rejects unknown item ids', () => {
  const valid = encode({ n: '食事', i: [10, 20] });
  const invalid = encode({ n: '不明', i: [999] });
  assert.deepEqual(extractCandidates(`説明\n${valid}\n${invalid}`), [valid, invalid]);
  assert.deepEqual(decodeShareCode(valid).itemIds, [10, 20]);
  const messages = [{ id: '1', content: `${valid} ${invalid}`, timestamp: '2026-07-14T00:00:00Z', edited_timestamp: null, author: { id: 'user' } }];
  const analyzed = analyzeMessages(messages, indexItems([
    { ID: 10, Name: '料理A', IconFile: '010000.webp' },
    { ID: 20, Name: '料理B', IconFile: '020000.webp' },
  ]), 'bot');
  assert.equal(analyzed.records.length, 1);
  assert.equal(analyzed.results.get('1').invalid.length, 1);
});

test('sorts by edited timestamp, marks duplicates, and renders horizontal icon items', () => {
  const code = encode({ n: '装備', i: [10] });
  const messages = [
    { id: '1', content: code, timestamp: '2026-07-13T00:00:00Z', edited_timestamp: '2026-07-15T00:00:00Z', author: { id: 'a' } },
    { id: '2', content: code, timestamp: '2026-07-14T00:00:00Z', edited_timestamp: null, author: { id: 'b' } },
  ];
  const analyzed = analyzeMessages(messages, indexItems([{ ID: 10, Name: '装備A', IconFile: '010000.webp' }]), 'bot');
  assert.equal(analyzed.records[0].messageId, '1');
  assert.ok(analyzed.records.every((record) => record.duplicate));
  const html = renderHtml(analyzed.records, 'Discordのシェアコード広場');
  assert.match(html, /flex-wrap:wrap/);
  assert.match(html, /2026\/07\/15/);
  assert.doesNotMatch(html, />Z[0-9A-Z]+</);
});
