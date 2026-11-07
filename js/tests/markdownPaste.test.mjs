/**
 * Markdown pasted as plain text: when it counts as Markdown, and what it
 * becomes.
 *
 *     npm test
 */

import assert from 'node:assert/strict';
import { check, done } from './_harness.mjs';
import { looksLikeMarkdown, markdownToHtml, isStyledPlainText } from '../../.test-build/markdownPaste.js';

const README = `# Scribe

A **WYSIWYG** editor for [Flarum](https://flarum.org).

## Install

\`\`\`bash
composer require ernestdefoe/scribe
\`\`\`

- Tables
- Spoilers
  - with titles
- Video embeds

1. Copy
2. Paste

> Quoted *line*

| Team | Wins |
| --- | ---: |
| Alabama | 11 |

---
Done ~~soon~~ now, see \`npm test\`.`;

check('a README is Markdown', () => {
  assert.ok(looksLikeMarkdown(README));
});

check('a heading, a fence, a table or a link is enough on its own', () => {
  assert.ok(looksLikeMarkdown('## Notes\nsome text'));
  assert.ok(looksLikeMarkdown('```\ncode\n```'));
  assert.ok(looksLikeMarkdown('see [the docs](https://example.com)'));
  assert.ok(looksLikeMarkdown('a | b\n--- | ---\n1 | 2'));
});

check('ordinary text is not Markdown', () => {
  assert.ok(!looksLikeMarkdown('Kickoff is at noon. Gates open at 10.'));
  assert.ok(!looksLikeMarkdown('- just one dash line'));
  assert.ok(!looksLikeMarkdown('2 * 3 * 4 = 24'));
  assert.ok(!looksLikeMarkdown('#hashtag and #another'));
  assert.ok(!looksLikeMarkdown('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
});

check("code is not Markdown, even when a comment looks like a heading", () => {
  assert.ok(!looksLikeMarkdown('# setup\nconst a = 1;\nif (a) {\n  run();\n}'));
});

check('two weaker signs together are Markdown', () => {
  assert.ok(looksLikeMarkdown('- milk\n- eggs'));
  assert.ok(looksLikeMarkdown('Use **bold** and `code` here'));
});

check('a README becomes headings, code, lists, a quote, a table and a divider', () => {
  const html = markdownToHtml(README);
  assert.ok(html.startsWith('<h1>Scribe</h1><p>A <strong>WYSIWYG</strong> editor for <a href="https://flarum.org">Flarum</a>.</p><h2>Install</h2>'), html);
  assert.match(html, /<pre data-lang="bash"><code>composer require ernestdefoe\/scribe<\/code><\/pre>/);
  assert.match(html, /<ul><li><p>Tables<\/p><\/li><li><p>Spoilers<\/p><ul><li><p>with titles<\/p><\/li><\/ul><\/li><li><p>Video embeds<\/p><\/li><\/ul>/);
  assert.match(html, /<ol data-type="decimal"><li><p>Copy<\/p><\/li><li><p>Paste<\/p><\/li><\/ol>/);
  assert.match(html, /<blockquote><p>Quoted <em>line<\/em><\/p><\/blockquote>/);
  assert.match(html, /<table><tbody><tr><th><p>Team<\/p><\/th><th><p>Wins<\/p><\/th><\/tr><tr><td><p>Alabama<\/p><\/td><td><p>11<\/p><\/td><\/tr><\/tbody><\/table>/);
  assert.match(html, /<hr><p>Done <s>soon<\/s> now, see <code>npm test<\/code>.<\/p>$/);
});

check('a heading deeper than four levels becomes level four', () => {
  assert.equal(markdownToHtml('###### Tiny'), '<h4>Tiny</h4>');
});

check('a numbered list keeps where it starts', () => {
  assert.equal(markdownToHtml('3. three\n4. four'), '<ol start="3" data-type="decimal"><li><p>three</p></li><li><p>four</p></li></ol>');
});

check('HTML in the text is text, and code is never formatted', () => {
  assert.equal(markdownToHtml('**<img src=x onerror=alert(1)>**'), '<p><strong>&lt;img src=x onerror=alert(1)&gt;</strong></p>');
  assert.equal(markdownToHtml('`**not bold** <b>`'), '<p><code>**not bold** &lt;b&gt;</code></p>');
});

check('links and images keep to http(s), mailto and the forum itself', () => {
  assert.equal(markdownToHtml('[x](javascript:alert(1))'), '<p>[x](javascript:alert(1))</p>');
  assert.equal(markdownToHtml('[x](data:text/html,hi)'), '<p>[x](data:text/html,hi)</p>');
  assert.equal(markdownToHtml('[mail](mailto:a@b.co) [home](/d/1)'), '<p><a href="mailto:a@b.co">mail</a> <a href="/d/1">home</a></p>');
  assert.equal(markdownToHtml('![logo](https://e.com/a.png?x=1&y=2)'), '<p><img src="https://e.com/a.png?x=1&amp;y=2" alt="logo"></p>');
  assert.equal(markdownToHtml('[q](https://e.com/" onclick="x)'), '<p>[q](https://e.com/&quot; onclick=&quot;x)</p>');
});

check('a task list keeps its boxes as characters', () => {
  assert.equal(markdownToHtml('- [ ] todo\n- [x] done'), '<ul><li><p>☐ todo</p></li><li><p>☑ done</p></li></ul>');
});

check("a code editor's coloured copy is still plain text; real formatting is not", () => {
  assert.ok(isStyledPlainText('<meta charset="utf-8"><div style="color:#ccc;white-space:pre;"><div><span style="color:#569cd6;"># Title</span></div><br></div>'));
  assert.ok(!isStyledPlainText('<h1>Title</h1>'));
  assert.ok(!isStyledPlainText('<p>a <strong>b</strong></p>'));
});

done();
