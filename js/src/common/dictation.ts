/**
 * Voice typing, the parts that are only text.
 *
 * Kept free of TipTap and the browser's recogniser so the tests can run it in
 * Node; tiptap/voice.ts does the listening.
 */

/**
 * The language the recogniser listens for: the reader's forum locale, as the
 * regional variant their browser prefers when it has one ("en" + a browser
 * set to en-GB → "en-GB"), because "en" alone is heard as American English.
 */
export function speechLang(locale: string, preferred: readonly string[]): string {
  const base = (locale || 'en').toLowerCase().split(/[-_]/)[0];
  const match = preferred.find((l) => l.toLowerCase().split('-')[0] === base);
  return match || locale || 'en';
}

const SENTENCE_END = /[.!?…]["')\]]*\s*$/;

/**
 * A recognised phrase, ready to go in after `before` (the text already in the
 * paragraph, up to the cursor).
 *
 * Recognisers hand back phrases without the space that joins them to what is
 * already there, and only sometimes with a capital. So: a space unless the
 * cursor already follows one or the phrase starts with punctuation, and a
 * capital at the start of a paragraph or a sentence.
 */
export function joinDictation(before: string, phrase: string, locale?: string): string {
  let text = phrase.replace(/\s+/g, ' ').trim();
  if (!text) return '';

  if (before.trim() === '' || SENTENCE_END.test(before)) {
    text = text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
  }

  if (before === '' || /\s$/.test(before) || /^[,.!?;:…)\]]/.test(text)) return text;

  return ' ' + text;
}
