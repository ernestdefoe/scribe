/**
 * Cells copied from a spreadsheet, as they arrive on the clipboard.
 *
 * 🚨 Excel puts a bitmap of the cells on the clipboard beside the table, and
 * FoF Upload uploaded it: the AP Poll went up as `image.png`. The fixtures are
 * what Excel for Windows and Mac, Google Sheets and LibreOffice Calc put under
 * `text/html`, stylesheets and all.
 *
 *     npm test
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOMParser } from 'linkedom';
import { hasTable, tsvRows, tsvToTableHtml, cleanTableHtml } from '../../.test-build/spreadsheetPaste.js';

let failures = 0;
let passes = 0;
function check(name, fn) {
  try {
    fn();
    passes++;
  } catch (e) {
    failures++;
    console.error(`✗ ${name}\n  ${e.message}`);
  }
}

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
// A browser's DOMParser always builds a <body>; linkedom needs one to find.
const parse = (html) => new DOMParser().parseFromString(/<html[\s>]/i.test(html) ? html : `<html><body>${html}</body></html>`, 'text/html');
// Whitespace and comments between tags are layout, not content.
const squash = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/>\s+</g, '><');
const clean = (html) => squash(cleanTableHtml(html, parse(html)));

check('Excel for Windows: a clean table, bold first row as the header', () => {
  const html = fixture('excel-windows.html');
  assert.ok(hasTable(html));
  assert.equal(
    clean(html),
    '<table>' +
      '<tr><th>Rank</th><th>Team</th><th>Record</th><th>Pts</th><th>Prev</th></tr>' +
      '<tr><td>1</td><td>Ohio State (62)</td><td>7-0</td><td>1,637</td><td>1</td></tr>' +
      '<tr><td>2</td><td>Texas A&amp;M</td><td>7-0</td><td>1,520</td><td>4</td></tr>' +
      '<tr><td>3</td><td>Miami</td><td>6-1</td><td>1,388</td><td></td></tr>' +
      '<tr><td colspan="5"><em>Others receiving votes: Utah 41, Vanderbilt\n  12</em></td></tr>' +
      '</table>'
  );
});

check('Excel for Mac: rowspan kept, bold run kept, in-cell line break kept, no header guessed', () => {
  assert.equal(
    clean(fixture('excel-mac.html')),
    '<table>' +
      '<tr><td>Conference</td><td>Team</td></tr>' +
      '<tr><td rowspan="2">Big Ten</td><td><strong>Ohio State</strong> (62)</td></tr>' +
      '<tr><td>Indiana<br>\n    Hoosiers</td></tr>' +
      '</table>'
  );
});

check('Google Sheets: the wrapper, widths and colours go; bold header and bold run stay', () => {
  assert.equal(
    clean(fixture('google-sheets.html')),
    '<table><tbody>' +
      '<tr><th>Rank</th><th>Team</th><th>Points</th></tr>' +
      '<tr><td>1</td><td><strong>Ohio State</strong> (62)</td><td>1,637</td></tr>' +
      '<tr><td>2</td><td>Texas A&amp;M</td><td></td></tr>' +
      '</tbody></table>'
  );
});

check('LibreOffice Calc: <b> header becomes a header row, alignment dropped', () => {
  assert.equal(
    clean(fixture('libreoffice-calc.html')),
    '<table><tr><th><b>Rank</b></th><th><b>Team</b></th></tr><tr><td>1</td><td>Ohio State</td></tr></table>'
  );
});

check('one copied cell is just its text', () => {
  const html = '<html><body><table><!--StartFragment--><tr><td class=xl65 align=right x:num>1,637</td></tr><!--EndFragment--></table></body></html>';
  assert.equal(clean(html), '<p>1,637</p>');
});

check('HTML without a table is left alone', () => {
  const html = '<p style="color:red">Just <span>text</span></p>';
  assert.equal(hasTable(html), false);
  assert.equal(clean(html), html);
});

check('content around a table survives (a Word document with a table in it)', () => {
  const html = '<p class=MsoNormal>Week 8 poll:</p><table class=MsoTableGrid border=1><tr><td width=100 valign=top><p class=MsoNormal>A<o:p></o:p></p></td><td><p class=MsoNormal>B</p></td></tr></table><p>Thoughts?</p>';
  assert.equal(clean(html), '<p>Week 8 poll:</p><table><tr><td><p>A<o:p></o:p></p></td><td><p>B</p></td></tr></table><p>Thoughts?</p>'.replace('<p>Week 8 poll:</p>', '<p class="MsoNormal">Week 8 poll:</p>'));
});

check('TSV from Numbers or a text editor becomes rows', () => {
  assert.deepEqual(tsvRows('Rank\tTeam\tRecord\n1\tOhio State\t7-0\n2\tIndiana\t7-0\n'), [
    ['Rank', 'Team', 'Record'],
    ['1', 'Ohio State', '7-0'],
    ['2', 'Indiana', '7-0'],
  ]);
});

check('Excel TSV: CRLF, empty cells, and a quoted cell with a line break and quotes', () => {
  assert.deepEqual(tsvRows('Team\tNote\r\nOhio State\t"Beat ""the team up north""\r\nagain"\r\nMiami\t\r\n'), [
    ['Team', 'Note'],
    ['Ohio State', 'Beat "the team up north"\nagain'],
    ['Miami', ''],
  ]);
});

check('a cell that merely starts with a quote is not a quoted cell', () => {
  assert.deepEqual(tsvRows('"Bama" fans\tcount\nmany\t3'), [
    ['"Bama" fans', 'count'],
    ['many', '3'],
  ]);
});

check('not a grid: one line, one column, ragged rows, tab-indented code', () => {
  assert.equal(tsvRows('a\tb\tc'), null);
  assert.equal(tsvRows('just\ntext'), null);
  assert.equal(tsvRows('a\tb\nc'), null);
  assert.equal(tsvRows('\tif (x) {\n\t\treturn;\n'), null);
  assert.equal(tsvRows('\tfoo();\n\tbar();'), null);
});

check('rows become a table in Scribe\'s own shape, escaped', () => {
  assert.equal(
    tsvToTableHtml([
      ['Team', 'Note'],
      ['A&M', '<b>x</b>\nline'],
    ]),
    '<table><tbody><tr><td><p>Team</p></td><td><p>Note</p></td></tr><tr><td><p>A&amp;M</p></td><td><p>&lt;b&gt;x&lt;/b&gt;<br>line</p></td></tr></tbody></table>'
  );
});

console.log(`${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
