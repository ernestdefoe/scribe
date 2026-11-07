/**
 * The `/` menu: when it opens and what it offers.
 *
 *     npm test
 */

import assert from 'node:assert/strict';
import { check, done } from './_harness.mjs';
import { slashQuery, filterSlashItems } from '../../.test-build/slashQuery.js';

check('a / at the start of a line opens the menu', () => {
  assert.deepEqual(slashQuery('/'), { query: '', length: 1 });
  assert.deepEqual(slashQuery('/tab'), { query: 'tab', length: 4 });
});

check('a / after a space opens it too', () => {
  assert.deepEqual(slashQuery('see this /spo'), { query: 'spo', length: 4 });
});

check('a path, a date, a URL and "and/or" never open it', () => {
  assert.equal(slashQuery('/usr/bin'), null);
  assert.equal(slashQuery('due 1/2'), null);
  assert.equal(slashQuery('https://example.com/a'), null);
  assert.equal(slashQuery('and/or'), null);
});

check('a space after the query closes it', () => {
  assert.equal(slashQuery('/table '), null);
  assert.equal(slashQuery('/table more'), null);
});

check('works in any script', () => {
  assert.deepEqual(slashQuery('مرحبا /جد'), { query: 'جد', length: 3 });
});

const items = [
  { key: 'heading2', label: 'Heading' },
  { key: 'table', label: 'Table' },
  { key: 'codeBlock', label: 'Code block' },
  { key: 'code', label: 'Inline code' },
  { key: 'spoiler', label: 'Spoiler' },
];

check('an empty query offers everything, in toolbar order', () => {
  assert.deepEqual(
    filterSlashItems(items, '').map((i) => i.key),
    items.map((i) => i.key)
  );
});

check('a label (or a word in it) that starts with the query comes first', () => {
  assert.deepEqual(
    filterSlashItems(items, 'co').map((i) => i.key),
    ['codeBlock', 'code']
  );
  assert.deepEqual(
    filterSlashItems(items, 'BLOCK').map((i) => i.key),
    ['codeBlock']
  );
});

check('then one that merely contains it, label or key', () => {
  assert.deepEqual(
    filterSlashItems(items, 'oil').map((i) => i.key),
    ['spoiler']
  );
  assert.deepEqual(
    filterSlashItems(items, 'heading2').map((i) => i.key),
    ['heading2']
  );
});

check('no match, nothing offered', () => {
  assert.deepEqual(filterSlashItems(items, 'zzz'), []);
});

done();
