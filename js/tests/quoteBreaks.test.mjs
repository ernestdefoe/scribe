/**
 * Quoting part of a Scribe post (flarum/mentions' Quote button) keeps its
 * paragraphs, list items and line breaks instead of running them together.
 *
 * mentionsQuote() below is what flarum/mentions does with a selection
 * (utils/selectedText.js + utils/reply.js); the quote it builds then goes
 * into the composer through legacyInsert, as it does in the forum.
 *
 *     npm test
 */

import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { check, done } from './_harness.mjs';
import { addQuoteBreaks } from '../../.test-build/quoteBreaks.js';
import { toEditorContent } from '../../.test-build/legacyInsert.js';

const body = (html) => new DOMParser().parseFromString(`<html><body><div class="Post-body">${html}</div></body></html>`, 'text/html').querySelector('.Post-body');

/** flarum/mentions: the selection's text, quoted under a mention. */
const mentionsQuote = (text) => '> @"Wil"#p7 ' + text.trim().replace(/\n/g, '\n> ') + '\n\n';

// A Scribe post as the server renders it: no whitespace between blocks.
const POST = '<h2>Season</h2><p>The <em>defense</em> is good<br>and fast</p><ul><li><p>one</p></li><li><p>two</p></li></ul><blockquote><p>quoted</p></blockquote><pre><code>a\nb</code></pre><table><tbody><tr><th><p>Team</p></th><th><p>Wins</p></th></tr><tr><td><p>Bama</p></td><td><p>11</p></td></tr></tbody></table>';

check('without the breaks, the quote runs together (the bug)', () => {
  assert.match(body(POST).textContent, /SeasonThe defense is goodand fastonetwo/);
});

check('with them, every block and line break is its own line', () => {
  const b = body(POST);
  addQuoteBreaks(b);
  const lines = b.textContent.split('\n').map((l) => l.trim()).filter(Boolean);
  assert.deepEqual(lines, ['Season', 'The defense is good', 'and fast', 'one', 'two', 'quoted', 'a', 'b', 'Team', 'Wins', 'Bama', '11']);
});

check('a list item or cell holding a paragraph gives one line, not one plus an empty one', () => {
  const b = body('<ul><li><p>one</p></li><li><p>two</p></li></ul><table><tbody><tr><td><p>1</p></td><td>2</td></tr></tbody></table>');
  addQuoteBreaks(b);
  assert.equal(b.textContent, 'one\ntwo\n1\n2\t\n');
});

check("a code block's highlighter script, once run, is not quoted with the code", () => {
  const html = '<pre><code>x = 1</code><script async src="https://cdn.example/loader.js"></script><script>if (window.hljsLoader) hl();</script></pre><p>after</p>';
  const b = body(html);
  addQuoteBreaks(b);
  assert.match(b.textContent, /hljsLoader/, 'left alone until the caller says the scripts have run');
  const run = body(html);
  addQuoteBreaks(run, true);
  assert.equal(run.textContent, 'x = 1\nafter\n');
  assert.equal(run.querySelector('script[src]').getAttribute('src'), 'https://cdn.example/loader.js');
});

check('a post written with Markdown, which already has breaks between blocks, gets no extra blank lines', () => {
  const b = body('<p>Line one</p>\n\n<p>What do you think <strong>this</strong></p>');
  addQuoteBreaks(b);
  assert.equal(b.textContent, 'Line one\n\nWhat do you think this\n');
});

check('nothing lands where white-space is drawn (a pre-wrap or pre-line theme, Recipes\' description)', () => {
  const b = body('<p>normal</p><div class="Recipe-description"><p>step one</p><p>line<br>two</p></div><p class="wrap">kept</p>');
  const ws = (el) => (el.closest('.Recipe-description') ? 'pre-line' : el.classList.contains('wrap') ? 'pre-wrap' : 'normal');
  addQuoteBreaks(b, false, ws);
  assert.equal(b.querySelector('.Recipe-description').innerHTML, '<p>step one</p><p>line<br>two</p>');
  assert.equal(b.querySelector('.wrap').innerHTML, 'kept');
  assert.equal(b.querySelector('p').innerHTML, 'normal\n');
});

check('code keeps exactly its own line breaks', () => {
  const b = body('<pre><code>if (x) {\n  y();\n}</code></pre>');
  addQuoteBreaks(b);
  assert.equal(b.querySelector('code').textContent, 'if (x) {\n  y();\n}');
});

check('running it again adds nothing', () => {
  const b = body(POST);
  addQuoteBreaks(b);
  const once = b.innerHTML;
  addQuoteBreaks(b);
  addQuoteBreaks(b);
  assert.equal(b.innerHTML, once);
});

check('top-level node count is unchanged, so Mithril can still remove the post body', () => {
  const b = body(POST);
  const before = b.childNodes.length;
  addQuoteBreaks(b);
  assert.equal(b.childNodes.length, before);
});

check('the quote reaches the composer as separate paragraphs in one blockquote', () => {
  const b = body('<p>First paragraph</p><p>Second <strong>one</strong></p><p>line<br>break</p>');
  addQuoteBreaks(b);
  assert.equal(
    toEditorContent(mentionsQuote(b.textContent)),
    '<blockquote><p>@&quot;Wil&quot;#p7 First paragraph</p><p>Second one</p><p>line</p><p>break</p></blockquote>'
  );
});

done();
