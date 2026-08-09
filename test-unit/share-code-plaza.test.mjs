import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeMessages,
  decodeShareCode,
  encodeLatestShareCode,
  extractCandidates,
  indexItems,
  indexLegacyItemNames,
  renderHtml,
} from '../tools/share-code-plaza.mjs';

function encode(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return `Z${bytes.length.toString(36).toUpperCase().padStart(4, '0')}${[...bytes].map((byte) => byte.toString(36).toUpperCase().padStart(2, '0')).join('')}`;
}

test('converts legacy share codes to the latest name-key format and rejects unknown items', () => {
  const valid = encode({ n: '食事', i: [10, 20] });
  const invalid = encode({ n: '不明', i: [999] });
  assert.deepEqual(extractCandidates(`説明\n${valid}\n${invalid}`), [valid, invalid]);
  assert.deepEqual(decodeShareCode(valid).itemKeys, [10, 20]);
  const messages = [{ id: '1', content: `${valid} ${invalid}`, timestamp: '2026-07-14T00:00:00Z', edited_timestamp: null, author: { id: 'user' } }];
  const analyzed = analyzeMessages(messages, indexItems([
    {
      Name: '料理A',
      IconFile: '010000.webp',
      Recipe: { CraftType: '3' },
      Recipes: [{ CraftType: '2' }, { CraftType: '3' }],
    },
    { Name: '料理B', IconFile: '020000.webp' },
  ]), 'bot', indexLegacyItemNames({ Items: { 10: '料理A', 20: '料理B' } }));
  assert.equal(analyzed.records.length, 1);
  assert.equal(analyzed.results.get('1').invalid.length, 1);
  assert.match(analyzed.records[0].code, /^N[A-Za-z0-9_-]+$/);
  assert.notEqual(analyzed.records[0].code, valid);
  assert.deepEqual(decodeShareCode(analyzed.records[0].code).itemKeys, ['料理A', '料理B']);
  assert.deepEqual(decodeShareCode(analyzed.records[0].code).selections, [{ itemKey: '料理A', craftType: 3 }]);
});

test('sorts by edited timestamp, marks duplicates, and renders horizontal icon items', () => {
  const code = encodeLatestShareCode({ name: '装備', itemNames: ['装備A'] });
  const messages = [
    { id: '1', content: code, timestamp: '2026-07-13T00:00:00Z', edited_timestamp: '2026-07-15T00:00:00Z', author: { id: 'a' } },
    { id: '2', content: code, timestamp: '2026-07-14T00:00:00Z', edited_timestamp: null, author: { id: 'b' } },
  ];
  const iconFile = '0123456789abcdefabcd-0123456789ab.webp';
  const analyzed = analyzeMessages(messages, indexItems([{ Name: '装備A', IconFile: iconFile }]), 'bot');
  assert.equal(analyzed.records[0].messageId, '1');
  assert.ok(analyzed.records.every((record) => record.duplicate));
  assert.deepEqual(extractCandidates(`説明\n${code}`), [code]);
  const html = renderHtml(analyzed.records, 'Discordのシェアコード広場');
  assert.match(html, /flex-wrap:wrap/);
  assert.match(html, /copy-button/);
  assert.match(html, /シェアコードをコピー/);
  assert.match(html, /data-code="N[A-Za-z0-9_-]+"/);
  assert.match(html, /Data: Lodestone/);
  assert.match(html, new RegExp(`/012/${iconFile.replace('.', '\\.')}"`));
  assert.match(html, /iconRetryKey/);
  assert.match(html, /2026\/07\/15/);
  assert.doesNotMatch(html, />Z[0-9A-Z]+</);
});
