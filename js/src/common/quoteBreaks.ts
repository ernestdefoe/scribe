/**
 * Line breaks a rendered Scribe post can be quoted with.
 *
 * 🚨 QUOTING PART OF A SCRIBE POST RAN ITS PARAGRAPHS TOGETHER ("Season!The
 * defense is good"). flarum/mentions builds a quote from the selection's
 * `textContent`, which holds only the whitespace that is in the DOM. A post
 * written with Markdown kept the line breaks of its source between blocks; a
 * Scribe post is stored as HTML with nothing between `</p><p>`, and a `<br>`
 * has no text at all, so every block of the quote landed on one line.
 *
 * So each block of a rendered post ends with a "\n" (a table cell with a tab),
 * and each <br> is followed by one. They are whitespace at the end of a block,
 * which the browser does not draw, inside the elements rather than between
 * them — the post body is Mithril's trusted HTML, and Mithril removes it later
 * by counting its top-level nodes, which must not change.
 *
 * Kept free of Flarum so the tests can run it in Node.
 */

const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, tr, details, summary, aside, section, figure, figcaption, dt, dd';
const CELLS = 'td, th';

/** White-space values under which a "\n" (or a tab) is drawn. */
const DRAWN = /^(pre|pre-wrap|pre-line|break-spaces)/;

/**
 * Adds the breaks under `root`. Safe to run again on the same content.
 *
 * 🚨 Never where white-space is drawn. Code blocks are skipped by name, but a
 * theme or an extension can render post text pre-wrap or pre-line — Recipes'
 * card sits inside the post with a pre-line description — and there the break
 * would be a visible empty line. So each landing spot's computed white-space
 * is asked, not assumed. `whiteSpaceOf` is for the tests, which have no CSS.
 */
export function addQuoteBreaks(root: Element, scriptsHaveRun = false, whiteSpaceOf?: (el: Element) => string): void {
  const doc = root.ownerDocument;
  if (!doc) return;

  const drawn = (el: Element | null): boolean => {
    if (!el) return false;
    try {
      const ws = whiteSpaceOf ? whiteSpaceOf(el) : doc.defaultView?.getComputedStyle?.(el).whiteSpace;
      return DRAWN.test(ws || '');
    } catch (e) {
      return false;
    }
  };

  /*
   * A code block's syntax highlighter comes as an inline <script> inside the
   * <pre>, and its source text was quoted with the code. CommentPost runs the
   * post's scripts in refreshContent, before this; once run, an inline
   * script's text is only words in the page, so it goes.
   */
  if (scriptsHaveRun) {
    root.querySelectorAll('script').forEach((script) => {
      if (!script.hasAttribute('src') && script.textContent) script.textContent = '';
    });
  }

  const end = (el: Element, ch: string) => {
    if (el.closest('pre, code, .Scribe-videoCaption') || drawn(el)) return;
    const last = el.lastChild;
    if (last && last.nodeType === 3 && /[\n\t]$/.test(last.textContent || '')) return;
    // A list item, cell or row whose content already ends in a break; a second
    // one quoted as an empty line.
    if (/\n$/.test(el.textContent || '')) return;
    // A post written with Markdown already has its line breaks between blocks.
    const next = el.nextSibling;
    if (next && next.nodeType === 3 && /^[ \t]*\n/.test(next.textContent || '')) return;
    el.appendChild(doc.createTextNode(ch));
  };

  // Last first, so a list item or row is looked at after what is inside it.
  Array.from(root.querySelectorAll(`${BLOCKS}, ${CELLS}`))
    .reverse()
    .forEach((el) => end(el, el.matches(CELLS) ? '\t' : '\n'));

  // A "\n" inside <pre> would be drawn, so the block after one starts with it.
  root.querySelectorAll('pre').forEach((pre) => {
    const next = pre.nextElementSibling;
    if (!next || pre.parentElement?.closest('pre') || drawn(next)) return;
    const first = next.firstChild;
    if (first && first.nodeType === 3 && /^\n/.test(first.textContent || '')) return;
    next.insertBefore(doc.createTextNode('\n'), first);
  });

  root.querySelectorAll('br').forEach((br) => {
    if (br.closest('pre, code') || drawn(br.parentElement)) return;
    const next = br.nextSibling;
    if (next && next.nodeType === 3 && /^\n/.test(next.textContent || '')) return;
    br.after(doc.createTextNode('\n'));
  });
}
