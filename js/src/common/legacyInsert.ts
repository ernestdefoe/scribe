/**
 * Translates the Markdown that other extensions insert into the composer.
 *
 * 🚨 This is not a Markdown parser and must never become one. Scribe exists so
 * that typing `**bold**` stays literal — the whole point. What this handles is
 * narrower and different: text that arrives through the editor driver's
 * insert* methods from OTHER extensions, which have every reason to still speak
 * Markdown because that is the contract Flarum's driver interface has always
 * had.
 *
 * Two of these matter enough that the editor is broken without them:
 *
 *   - Quoting a post. flarum/mentions builds `> quoted text` and hands it to
 *     insertAtCursor (utils/reply.js). Without translation, highlighting a post
 *     and hitting Reply drops a literal "> " into the composer.
 *   - FoF Upload inserts `![alt](url)` after an upload finishes.
 *
 * Anything not recognised is returned as null and inserted as plain text, which
 * is the correct outcome for ordinary typing.
 */

const IMAGE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

/*
 * 🚨 FoF Upload's OTHER format, and the reason a pasted image showed up as a
 * line of raw text.
 *
 * FoF Upload has two insert modes. In Markdown mode it hands over
 * `![alt](url)`, which IMAGE above already understands. In "image preview" mode
 * — which is the default for images and what a paste produces — it hands over
 *
 *     [upl-image-preview url=https://… uuid=… thumbnail_url=…]
 *
 * That is not Markdown and never was, so it fell through to being inserted
 * verbatim: the poster saw a bracketed line of attributes sitting in their
 * post. Reported by tennyy on Flarum 2.0.0-rc.8 with Scribe 1.1.1.
 *
 * Attributes are unordered and the set differs by version, so this reads
 * `url=` out of the tag rather than matching a fixed shape. `thumbnail_url` is
 * deliberately not preferred: the thumbnail is a downscaled copy, and quietly
 * substituting it would put a blurry image in a post whose author chose a
 * sharp one.
 */
const UPL_PREVIEW = /\[upl-image-preview\s+([^\]]*)\]/g;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Only http(s) and root-relative targets; never javascript: or data:. */
function safeUrl(url: string): string | null {
  const u = url.trim();
  if (u.startsWith('/') && !u.startsWith('//')) return u;
  return /^https?:\/\//i.test(u) ? u : null;
}

/** Pull one attribute out of a BBCode-style attribute list. */
function attribute(attrs: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\s)${name}=("[^"]*"|'[^']*'|[^\\s\\]]+)`, 'i').exec(attrs);

  if (!match) return null;

  return match[1].replace(/^["']|["']$/g, '');
}

function inline(text: string): string {
  let out = escapeHtml(text);

  /*
   * 🚨 Before IMAGE and LINK, because the tag's own attributes contain URLs
   * and a `[…](…)` pattern could otherwise match across it. Replacing the
   * whole tag first means the later passes never see its insides.
   */
  out = out.replace(UPL_PREVIEW, (whole, attrs) => {
    /*
     * 🚨 escapeHtml has ALREADY run on this text, so the attribute list
     * arrives with its punctuation encoded: `&` is `&amp;` and `"` is
     * `&quot;`. Both have to be put back before the attributes can be read.
     *
     * Undoing only `&amp;` was the first cut, and it silently broke every
     * QUOTED value — `url="https://…/a b.png"` arrived as
     * `url=&quot;https://…&quot;`, matched nothing, and the tag was left as
     * raw text exactly as before the fix. Caught by a test, not by reading it.
     */
    const raw = String(attrs)
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;/g, "'")
      .replace(/&amp;/g, '&');
    const src = attribute(raw, 'url');
    const safe = src ? safeUrl(src) : null;

    if (!safe) return whole;

    const alt = attribute(raw, 'alt') ?? '';

    return `<img src="${escapeHtml(safe)}" alt="${escapeHtml(alt)}">`;
  });

  out = out.replace(IMAGE, (whole, alt, src) => {
    const safe = safeUrl(src);
    return safe ? `<img src="${escapeHtml(safe)}" alt="${escapeHtml(alt)}">` : whole;
  });
  out = out.replace(LINK, (whole, label, href) => {
    const safe = safeUrl(href);
    return safe ? `<a href="${escapeHtml(safe)}">${label}</a>` : whole;
  });
  return out;
}

/**
 * @returns HTML to insert, or null when the text holds nothing to translate.
 */
export function toEditorContent(text: string): string | null {
  const hasQuote = /^\s*>\s?/m.test(text);
  const hasMedia = IMAGE.test(text) || LINK.test(text) || UPL_PREVIEW.test(text);
  // these are /g — reset before reuse, or the next call starts mid-string
  IMAGE.lastIndex = LINK.lastIndex = UPL_PREVIEW.lastIndex = 0;
  if (!hasQuote && !hasMedia) return null;

  const blocks: string[] = [];
  let quoted: string[] = [];

  const flushQuote = () => {
    if (!quoted.length) return;
    blocks.push(`<blockquote>${quoted.map((l) => `<p>${inline(l)}</p>`).join('')}</blockquote>`);
    quoted = [];
  };

  for (const line of text.split('\n')) {
    const q = line.match(/^\s*>\s?(.*)$/);
    if (q) {
      quoted.push(q[1]);
      continue;
    }
    flushQuote();
    // A blank line between blocks is structure, not content — it must not
    // become an empty paragraph inside the quote.
    if (line.trim() !== '') blocks.push(`<p>${inline(line)}</p>`);
  }
  flushQuote();

  return blocks.join('');
}
