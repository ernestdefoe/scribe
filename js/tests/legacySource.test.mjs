/**
 * Editing a post written before Scribe (namavic, issue 1): its stored source
 * is Markdown (flarum/markdown, fof/rich-text) or BBCode, and it must load as
 * formatting, not as one paragraph of literal asterisks. A post Scribe wrote
 * must load exactly as it was saved.
 *
 * The first source is what tests/Formatter/LegacyPostTest.php shows Flarum
 * hands the composer for the reported post.
 *
 *     npm test
 */

import assert from 'node:assert/strict';
import { check, done } from './_harness.mjs';
import { readFileSync } from 'node:fs';
import { toEditorSource, isScribeSource } from '../../.test-build/legacySource.js';

const firstNodes = JSON.parse(readFileSync(new URL('./fixtures/scribe-first-nodes.json', import.meta.url), 'utf8'));

check('the reported post: two paragraphs and real bold', () => {
  assert.equal(toEditorSource('Line one\n\nWhat do you think **this**'), '<p>Line one</p><p>What do you think <strong>this</strong></p>');
});

check('a single line break stays a line break, as Flarum rendered it', () => {
  assert.equal(toEditorSource('Roses are red\nViolets are blue'), '<p>Roses are red<br>Violets are blue</p>');
});

check('a post Scribe wrote loads exactly as saved', () => {
  for (const html of [
    '<p>Hi <strong>there</strong> **literal**</p>',
    '<h2>Title</h2><p>x</p>',
    '<ul><li><p>a</p></li></ul>',
    '<details class="Scribe-spoiler" data-title="End"><p>He lives.</p></details>',
    '<table><tbody><tr><td><p>1</p></td></tr></tbody></table>',
    '<p></p>',
  ]) {
    assert.ok(isScribeSource(html), html);
    assert.equal(toEditorSource(html), html);
  }
});

check('every node Scribe can put first in a post is recognized as Scribe HTML and loads untouched', () => {
  const cases = Object.entries(firstNodes.cases);
  assert.ok(cases.length >= 25, 'fixture holds the captured cases');
  for (const [node, html] of cases) {
    assert.ok(isScribeSource(html), `${node}: ${html}`);
    assert.equal(toEditorSource(html), html, node);
  }
  // Nodes other extensions register bring tags of their own.
  for (const html of ['<embed data-ruffle="x"></embed>', '<div data-recipe="1"><p>x</p></div>', '<scribe-thing data-x="1"></scribe-thing>']) {
    assert.ok(isScribeSource(html), html);
  }
});

check('a schema node with no captured case fails the test, so a new node is not missed', () => {
  const covered = { doc: 1, text: 1, listItem: 1, tableRow: 1, tableHeader: 1, tableCell: 1, hardBreak: 1 };
  const names = Object.keys(firstNodes.cases).join(' ').toLowerCase();
  const byNode = { paragraph: 'paragraph', codeBlock: 'codeblock', heading: 'heading', bulletList: 'bulletlist', orderedList: 'orderedlist', blockquote: 'blockquote', horizontalRule: 'horizontalrule', image: 'image', scribeImageAlign: 'aligned image', scribeSpoiler: 'spoiler', scribeInfo: 'info box', scribeReply: 'reply gate', scribeVideo: 'youtube', table: 'table' };
  for (const node of firstNodes.schemaNodes) {
    if (covered[node]) continue;
    assert.ok(byNode[node] && names.includes(byNode[node]), `no first-node case for "${node}": add one to tests/fixtures/scribe-first-nodes.json`);
  }
});

check('Markdown and BBCode never look like Scribe HTML', () => {
  for (const md of ['<https://flarum.org> is the site', '<3 this', '# Title', '[b]x[/b]', '> quote', '- item', '**bold**', '@"Wil"#p1 hi']) {
    assert.ok(!isScribeSource(md), md);
  }
});

check('plain old text without any marks still keeps its paragraphs', () => {
  assert.equal(toEditorSource('First.\n\nSecond.'), '<p>First.</p><p>Second.</p>');
});

check('empty and missing sources load empty', () => {
  assert.equal(toEditorSource(''), '');
  assert.equal(toEditorSource(null), '');
  assert.equal(toEditorSource('  '), '  ');
});

check('Markdown: headings, italic, strike, links, inline code, code blocks, lists, quotes', () => {
  const html = toEditorSource(
    '# Season\n\nThe *defense* and ~~kicker~~, see [schedule](https://example.com/s) and `npm test`.\n\n```php\necho 1;\n```\n\n- one\n- two\n\n1. first\n2. second\n\n> quoted\n> twice'
  );
  assert.equal(
    html,
    '<h1>Season</h1>' +
      '<p>The <em>defense</em> and <s>kicker</s>, see <a href="https://example.com/s">schedule</a> and <code>npm test</code>.</p>' +
      '<pre data-lang="php"><code>echo 1;</code></pre>' +
      '<ul><li><p>one</p></li><li><p>two</p></li></ul>' +
      '<ol data-type="decimal"><li><p>first</p></li><li><p>second</p></li></ol>' +
      '<blockquote><p>quoted<br>twice</p></blockquote>'
  );
});

check("fof/rich-text's marks: superscript, subscript, escapes", () => {
  assert.equal(toEditorSource('E = mc^2^ and H~2~O'), '<p>E = mc<sup>2</sup> and H<sub>2</sub>O</p>');
  assert.equal(toEditorSource('Not \\*bold\\* and 2 \\* 3'), '<p>Not *bold* and 2 * 3</p>');
  assert.equal(toEditorSource('**bold** and ~~gone~~'), '<p><strong>bold</strong> and <s>gone</s></p>');
});

check('an inline spoiler, which a post has no place for, keeps its text', () => {
  assert.equal(toEditorSource('He >!lives!< in the end'), '<p>He &gt;!lives!&lt; in the end</p>');
});

check('BBCode: bold, italic, underline, strike, links, images, quotes, code, lists', () => {
  assert.equal(
    toEditorSource('[b]Bold[/b] [i]it[/i] [u]under[/u] [s]gone[/s] [url=https://e.com/a]site[/url] [url]https://e.com/b[/url]'),
    '<p><strong>Bold</strong> <em>it</em> <u>under</u> <s>gone</s> <a href="https://e.com/a">site</a> <a href="https://e.com/b">https://e.com/b</a></p>'
  );
  assert.equal(toEditorSource('[img]https://e.com/a.png[/img]'), '<p><img src="https://e.com/a.png" alt=""></p>');
  assert.equal(toEditorSource('[quote=Wil]Go team\n[b]now[/b][/quote]\nAgreed'), '<blockquote><p>Go team<br><strong>now</strong></p></blockquote><p>Agreed</p>');
  assert.equal(toEditorSource('[code=php]echo "**x**";[/code]'), '<pre data-lang="php"><code>echo &quot;**x**&quot;;</code></pre>');
  assert.equal(toEditorSource('[list][*]one[*]two[/list]'), '<ul><li><p>one</p></li><li><p>two</p></li></ul>');
  assert.equal(toEditorSource('[color=red]red[/color] [size=20]big[/size]'), '<p>red big</p>');
});

check('nothing in an old post becomes markup or a script', () => {
  assert.equal(toEditorSource('<3 and <script>x</script> **b**'), '<p>&lt;3 and &lt;script&gt;x&lt;/script&gt; <strong>b</strong></p>');
  assert.equal(toEditorSource('[url=javascript:alert(1)]x[/url]'), '<p>[url=javascript:alert(1)]x[/url]</p>');
  assert.equal(toEditorSource('[img]data:image/png,x[/img]'), '<p>[img]data:image/png,x[/img]</p>');
});

check('mentions, emoji codes and quote replies survive as text for their own parsers', () => {
  assert.equal(toEditorSource('@"Wil Vincent"#p123 agreed :smile:'), '<p>@&quot;Wil Vincent&quot;#p123 agreed :smile:</p>');
  assert.equal(toEditorSource('> @"namavic"#p42 wrote:\n> Old **bold** reply'), '<blockquote><p>@&quot;namavic&quot;#p42 wrote:<br>Old <strong>bold</strong> reply</p></blockquote>');
});

done();
