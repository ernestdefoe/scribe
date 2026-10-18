/**
 * Word's footnote and endnote marks, pasted as plain superscripts.
 *
 * 🚨 Word puts a note mark on the clipboard as a link with the mark in square
 * brackets: `<a href="#_edn1">[i]</a>`. Endnotes number i, ii, iii by default,
 * so the first one is `[i]`, the BBCode for italic. flarum/bbcode reads the
 * text of every Scribe post, so it opened an italic that nothing closed, and
 * the rest of the article was in italics (Wil Vincent, 2026-10-18). Footnotes
 * lettered a, b… would open `[b]` the same way.
 *
 * Both directions are links: the mark in the text (`href="#_edn1"`) and the
 * one at the start of each note (`name="_edn1" href="#_ednref1"`). Neither
 * anchor exists once posted, so the link goes and the mark stays, without its
 * brackets, as the superscript it looked like in Word.
 */
const NOTE_LINK = /<a\b[^>]*\b(?:href|name)\s*=\s*["']?#?_(?:edn|ftn)(?:ref)?\d+\b[^>]*>([\s\S]*?)<\/a>/gi;

export function wordNotesToSuperscript(html: string): string {
  return html.replace(NOTE_LINK, (_match, inner: string) => {
    const mark = inner
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .trim()
      .replace(/^\[(.*)\]$/, '$1');

    return mark === '' ? '' : `<sup>${mark}</sup>`;
  });
}
