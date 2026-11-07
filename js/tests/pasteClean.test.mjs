/**
 * Word, Google Docs and web pages, pasted: what survives.
 *
 * The fixtures are the `text/html` each puts on the clipboard, trimmed.
 *
 *     npm test
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOMParser } from 'linkedom';
import { check, done } from './_harness.mjs';
import { cleanPastedHtml, isEditorHtml, pastedColor } from '../../.test-build/pasteClean.js';
import { cleanTableHtml } from '../../.test-build/spreadsheetPaste.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const parse = (html) => new DOMParser().parseFromString(/<html[\s>]/i.test(html) ? html : `<html><body>${html}</body></html>`, 'text/html');
const squash = (html) => html.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
const clean = (html, options = { color: false, highlight: false }) => {
  const doc = parse(html);
  cleanPastedHtml(doc, options);
  return squash(doc.body.innerHTML);
};

check('Word: title, bold and italic kept; fonts, Office tags and spacer paragraphs gone', () => {
  const out = clean(fixture('word-document.html'));
  assert.ok(out.startsWith('<h1>Season preview</h1><p>The <b>defense</b> looks <i>much</i> better and the kicker is new.</p>'), out);
  assert.doesNotMatch(out, /mso|Mso|o:p|style=|class=|lang=|&nbsp;|font-family|<p>\s*<\/p>/);
});

check('Word: bulleted paragraphs become a nested list, without their bullet characters', () => {
  const out = clean(fixture('word-document.html'));
  assert.match(out, /<ul><li><p>Quarterback<\/p><ul><li><p>Starter returns<\/p><\/li><\/ul><\/li><li><p>Offensive line<\/p><\/li><\/ul>/);
  assert.doesNotMatch(out, /·|>o</);
});

check('Word: numbered paragraphs become a numbered list, links kept', () => {
  const out = clean(fixture('word-document.html'));
  assert.match(out, /<ol><li><p>Win the opener<\/p><\/li><li><p><a href="https:\/\/example.com\/schedule">See the schedule<\/a><\/p><\/li><\/ol>/);
});

check('Word: a fifth-level heading becomes the smallest heading the editor has', () => {
  assert.match(clean(fixture('word-document.html')), /<h4>Small print<\/h4>$/);
});

check('Word: a real colour is kept only when the toolbar has the colour button, black never', () => {
  assert.doesNotMatch(clean(fixture('word-document.html')), /data-color/);
  const out = clean(fixture('word-document.html'), { color: true, highlight: false });
  assert.match(out, /<span data-color="#c00000">kicker<\/span>/);
  assert.equal((out.match(/data-color/g) || []).length, 1, out);
});

check("Google Docs: the selection's bold wrapper is not bold", () => {
  const out = clean(fixture('google-docs.html'));
  assert.ok(!out.startsWith('<b'), out);
  assert.match(out, /^<h2>Game day notes<\/h2>/);
});

check('Google Docs: styled spans become bold, italic, underline, strikethrough and superscript', () => {
  const out = clean(fixture('google-docs.html'));
  assert.match(out, /<p><strong>Kickoff<\/strong><em> is at noon<\/em><u>, gates open at ten<\/u><sup>1<\/sup><\/p>/);
  assert.match(out, /<li><p><s>Tailgate lot A<\/s><\/p><\/li>/);
});

check("Google Docs: the <br> between blocks goes, a link keeps its address and loses the doc's blue", () => {
  const out = clean(fixture('google-docs.html'), { color: true, highlight: true });
  assert.doesNotMatch(out, /<br/);
  assert.match(out, /<a href="https:\/\/example.com\/parking">Parking map<\/a>/);
  assert.doesNotMatch(out, /#1155cc/);
});

check('Google Docs: a yellow highlight is kept only when the toolbar has highlight', () => {
  assert.doesNotMatch(clean(fixture('google-docs.html')), /<mark/);
  assert.match(clean(fixture('google-docs.html'), { color: false, highlight: true }), /<mark data-color="#ffff00"><u>, gates open at ten<\/u><\/mark>/);
});

check('web page: scripts, forms and event handlers never survive', () => {
  const out = clean('<div onclick="x()"><p style="color:red" onmouseover="y()">Hi <img src="https://e.com/a.png" onerror="z()" alt="a"></p><script>bad()</script><form><input></form></div>');
  assert.equal(out, '<div><p>Hi <img src="https://e.com/a.png" alt="a"></p></div>');
});

check("Scribe's own classes and data attributes survive, so a copied spoiler is still one", () => {
  const out = clean('<details class="Scribe-spoiler foo" data-title="Ending"><div class="Scribe-spoilerBody"><p>He lives.</p></div></details>');
  assert.equal(out, '<details class="Scribe-spoiler" data-title="Ending"><div class="Scribe-spoilerBody"><p>He lives.</p></div></details>');
});

check('a copy out of the editor itself is recognized and left alone', () => {
  assert.ok(isEditorHtml('<p data-pm-slice="1 1 []">x</p>'));
  assert.ok(!isEditorHtml('<p>x</p>'));
});

check('tables are left for the spreadsheet pass, which still finds the header row', () => {
  const html = fixture('excel-windows.html');
  const doc = parse(html);
  cleanPastedHtml(doc, { color: false, highlight: false });
  assert.match(squash(cleanTableHtml(html, doc)), /^<table>(<tbody>)?<tr><th>Rank<\/th>/);
});

check('only colours with real hue count', () => {
  assert.equal(pastedColor('#C00000'), '#c00000');
  assert.equal(pastedColor('rgb(17, 85, 204)'), '#1155cc');
  assert.equal(pastedColor('red'), '#ff0000');
  assert.equal(pastedColor('#f80'), '#ff8800');
  for (const grey of ['black', '#000000', 'windowtext', 'rgb(0,0,0)', '#ffffff', 'white', 'transparent', 'rgba(255,0,0,0)', '#777', 'inherit']) {
    assert.equal(pastedColor(grey), null, grey);
  }
});

done();
