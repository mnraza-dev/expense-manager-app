const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { patchQueryDecoder } = require('../scripts/patch-query-decoder.cjs');
const query = require('query-string');
test('patched navigation queries preserve multilingual text, plus spaces, separators and round trips', () => {
  const original = { name: 'भोजन & سفر', amount: '125.50', path: '/transaction/12' };
  assert.deepEqual({ ...query.parse(query.stringify(original)) }, original);
  assert.equal(query.parse('note=food+and+bus').note, 'food and bus');
  assert.deepEqual(query.parse('category=1,2', { arrayFormat: 'comma' }).category, ['1', '2']);
  assert.equal(query.parse('note=%').note, '%');
});
test('malformed percent-encoded deep links complete under a bounded process timeout', () => {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `
    const q = require('query-string');
    const malformed = '%FE'.repeat(4096) + '%C3%A5%';
    const result = q.parse('note=' + malformed);
    if (typeof result.note !== 'string' || !result.note.endsWith('å%')) process.exit(2);
  `,
    ],
    { cwd: process.cwd(), timeout: 2500, encoding: 'utf8' }
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});
test('decoder compatibility patch is idempotent and refuses unknown vendor implementations', () => {
  const patched = patchQueryDecoder("const decodeComponent = require('decode-uri-component');");
  assert.equal(patchQueryDecoder(patched), patched);
  assert.throws(() => patchQueryDecoder('unknown code'), /implementation changed/);
});
