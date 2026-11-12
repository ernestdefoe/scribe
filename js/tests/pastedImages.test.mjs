/**
 * Pictures that arrive only inside the pasted HTML: which ones are uploaded.
 *
 *     npm test
 */

import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { check, done } from './_harness.mjs';
import { embeddedImages, isWebImage, unreachableImagesOnly } from '../../.test-build/pastedImages.js';

const parse = (html) => new DOMParser().parseFromString(/<html[\s>]/i.test(html) ? html : `<html><body>${html}</body></html>`, 'text/html');
const files = (html) => embeddedImages(parse(html));

// A 1×1 transparent PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const png = `data:image/png;base64,${PNG}`;

const [alone] = files(`<meta charset="utf-8"><img src="${png}">`);
const aloneBytes = alone && new Uint8Array(await alone.arrayBuffer());

check('a picture alone becomes a file with its bytes', () => {
  assert.equal(alone.name, 'image.png');
  assert.equal(alone.type, 'image/png');
  assert.deepEqual(aloneBytes, Uint8Array.from(Buffer.from(PNG, 'base64')));
});

check('Word and Office wrap it in a fragment of their own', () => {
  const got = files(`<html><body><!--StartFragment--><p><img width="20" height="20" src="${png}"></p><!--EndFragment--></body></html>`);
  assert.equal(got.length, 1);
});

check('several pictures are all uploaded', () => {
  assert.equal(files(`<p><img src="${png}"></p><p><img src="${png}"></p>`).length, 2);
});

check('a JPEG is a .jpg', () => {
  const [file] = files(`<img src="data:image/jpeg;base64,${PNG}">`);
  assert.equal(file.name, 'image.jpg');
  assert.equal(file.type, 'image/jpeg');
});

check('base64 broken over lines still decodes', () => {
  assert.equal(files(`<img src="data:image/png;base64,${PNG.slice(0, 20)}\n${PNG.slice(20)}">`).length, 1);
});

check('words beside the picture: the paste goes in as text, nothing uploads', () => {
  assert.equal(files(`<p>Look at this <img src="${png}"></p>`).length, 0);
});

check('a picture on the web is not embedded: nothing uploads', () => {
  assert.equal(files('<img src="https://example.com/a.png">').length, 0);
  assert.equal(files('<img src="blob:https://teams.microsoft.com/1234">').length, 0);
});

check('one picture that cannot go spoils the lot', () => {
  assert.equal(files(`<img src="${png}"><img src="https://example.com/a.png">`).length, 0);
});

check('SVG is a document, not a picture', () => {
  assert.equal(files('<img src="data:image/svg+xml;base64,PHN2Zy8+">').length, 0);
});

check('not base64, or not decodable: nothing uploads', () => {
  assert.equal(files('<img src="data:image/png,rawbytes">').length, 0);
  assert.equal(files('<img src="data:image/png;base64,a">').length, 0);
});

check('no picture at all', () => {
  assert.equal(files('<p></p>').length, 0);
  assert.equal(files('').length, 0);
});

check('web and relative addresses are web pictures; blob:, file: and the rest are not', () => {
  for (const src of ['https://example.com/a.png', 'http://example.com/a.png', '/assets/files/a.png', '//cdn.example.com/a.png', 'a.png']) {
    assert.equal(isWebImage(src), true, src);
  }
  for (const src of ['blob:https://teams.microsoft.com/1', 'file:///C:/a.png', 'cid:image001.png@01D', 'webkit-fake-url://x/a.png', 'javascript:alert(1)', png]) {
    assert.equal(isWebImage(src), false, src);
  }
});

check('a paste of only unreachable pictures is told apart from one with words or a web picture', () => {
  assert.equal(unreachableImagesOnly(parse('<img src="blob:https://teams.microsoft.com/1">')), true);
  assert.equal(unreachableImagesOnly(parse('<p><img src="file:///C:/a.png"><img src="blob:x"></p>')), true);
  assert.equal(unreachableImagesOnly(parse('<p>Hi <img src="blob:x"></p>')), false);
  assert.equal(unreachableImagesOnly(parse('<img src="blob:x"><img src="https://example.com/a.png">')), false);
  assert.equal(unreachableImagesOnly(parse('<p></p>')), false);
});

done();
