/**
 * A post's stored source, made fit for the editor.
 *
 * 🚨 EDITING A POST WRITTEN BEFORE SCRIBE DESTROYED IT (namavic, issue 1).
 * The edit composer gets the post's SOURCE, not its HTML. For a post Scribe
 * wrote that source is HTML, which the editor reads as it is. For a post
 * written while flarum/markdown (or fof/rich-text, which writes Markdown) was
 * on, it is Markdown text: `Line one\n\nWhat do you think **this**`. Read as
 * HTML, its line breaks collapsed into one paragraph and every `**` stayed a
 * literal asterisk — and saving made that the post.
 *
 * So a source that is not Scribe's own HTML is read as what it is: Markdown
 * and BBCode, with Flarum's rule that a single line break is a break.
 *
 * Kept free of TipTap and the editor so the tests can run it in Node.
 */
import { markdownToHtml } from './markdownPaste';

/**
 * Whether a stored source is HTML Scribe wrote.
 *
 * Scribe's output always opens with an element: a block (`<p>`, `<h2>`,
 * `<table>`, `<video>`…), an image (`<img>`), a linked image (`<a href>`), or
 * a node another extension registered, with a tag of its own. So ANY opening
 * tag counts, never a list of known ones: a list missed the linked image, and
 * would miss every node registered later (tests/fixtures/scribe-first-nodes).
 *
 * A Markdown or BBCode post opens with text, `#`, `-`, `>`, `[` or an
 * autolink `<https://…>`, none of which is an element.
 */
export function isScribeSource(source: string): boolean {
  return /^\s*<[a-z][a-z0-9-]*[\s/>]/i.test(source);
}

/** The source as the editor should load it. */
export function toEditorSource(source: string | null | undefined): string {
  const text = source || '';
  if (!text.trim() || isScribeSource(text)) return text;
  return markdownToHtml(blockBbcode(text), { legacy: true });
}

/**
 * Block BBCode as the Markdown that means the same, so the one converter
 * handles both: [quote] becomes `> ` lines, [code] a fence, [list] items.
 * Inline BBCode ([b], [url], [img]…) is read by the converter itself.
 */
export function blockBbcode(text: string): string {
  let out = text.replace(/\r\n?/g, '\n');

  out = out.replace(/\[code(?:=([\w+#.-]+))?\]\n?([\s\S]*?)\n?\[\/code\]/gi, (_, lang, body) => `\n\`\`\`${lang || ''}\n${body}\n\`\`\`\n`);

  // Innermost first, so a quote inside a quote nests.
  for (let i = 0; i < 5 && /\[quote/i.test(out); i++) {
    out = out.replace(
      /\[quote(?:=[^\]]*)?\]\n?((?:(?!\[quote)[\s\S])*?)\n?\[\/quote\]/gi,
      (_, body) =>
        '\n' +
        String(body)
          .split('\n')
          .map((l: string) => (l ? `> ${l}` : '>'))
          .join('\n') +
        '\n'
    );
  }

  out = out.replace(/\[list(=1)?\]([\s\S]*?)\[\/list\]/gi, (_, ordered, body) => {
    const items = String(body)
      .split(/\[\*\]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return '\n' + items.map((item, i) => `${ordered ? `${i + 1}.` : '-'} ${item.replace(/\n/g, ' ')}`).join('\n') + '\n';
  });

  return out;
}
