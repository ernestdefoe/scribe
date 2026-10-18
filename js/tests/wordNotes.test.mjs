/**
 * Word's footnote and endnote marks, as they arrive on the clipboard.
 *
 * 🚨 The first endnote is `[i]`, the BBCode for italic: posted as is, it put
 * the rest of an article in italics. The real shape below is what Word for
 * Mac and Windows put on the clipboard, nested spans and all.
 *
 *     npm test
 */

import assert from 'node:assert/strict';
import { wordNotesToSuperscript } from '../../.test-build/wordNotes.js';

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

check('an endnote mark in the text becomes a superscript without brackets', () => {
  const html = `<p>Ratings are down<a style='mso-endnote-id:edn1' href="#_edn1" name="_ednref1" title=""><span class=MsoEndnoteReference><span style='font-size:12.0pt'>[i]</span></span></a> this week.</p>`;
  assert.equal(wordNotesToSuperscript(html), '<p>Ratings are down<sup>i</sup> this week.</p>');
});

check('the back-link at the start of the note goes the same way', () => {
  const html = `<p class=MsoEndnoteText><a style='mso-endnote-id:edn1' href="#_ednref1" name="_edn1" title=""><span class=MsoEndnoteReference>[i]</span></a> One for the streams.</p>`;
  assert.equal(wordNotesToSuperscript(html), '<p class=MsoEndnoteText><sup>i</sup> One for the streams.</p>');
});

check('footnotes too, numbered or lettered', () => {
  assert.equal(wordNotesToSuperscript('<a href="#_ftn1" name="_ftnref1">[1]</a>'), '<sup>1</sup>');
  assert.equal(wordNotesToSuperscript('<a href="#_ftn2" name="_ftnref2"><span>[b]</span></a>'), '<sup>b</sup>');
});

check('every mark in one paste, not just the first', () => {
  const html = '<a href="#_edn1">[i]</a> and <a href="#_edn2">[ii]</a> and <a href="#_edn3">[iii]</a>';
  assert.equal(wordNotesToSuperscript(html), '<sup>i</sup> and <sup>ii</sup> and <sup>iii</sup>');
});

check('ordinary links and in-page anchors are left alone', () => {
  const html = '<a href="https://example.com/_edn1">site</a> <a href="#section2">jump</a> <a name="_Toc12">toc</a>';
  assert.equal(wordNotesToSuperscript(html), html);
});

check('an empty anchor leaves nothing behind', () => {
  assert.equal(wordNotesToSuperscript('x<a name="_ftnref1" href="#_ftn1"></a>y'), 'xy');
});

console.log(`${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
