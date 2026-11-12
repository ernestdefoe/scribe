/**
 * HTML pasted from Word, Google Docs and web pages, cleaned down to what a
 * post can hold.
 *
 * ProseMirror already drops elements the editor has no node for, but it
 * keeps what they leave behind:
 *
 *   - Word writes a list as paragraphs that START with a bullet character and
 *     some &nbsp;, so a pasted list arrived as "·   item" lines, not a list.
 *   - Word spaces paragraphs with empty ones (`<p><o:p>&nbsp;</o:p></p>`), and
 *     Google Docs puts a `<br>` between every block, so every paragraph came
 *     with a blank one after it.
 *   - Google Docs wraps the whole selection in
 *     `<b style="font-weight:normal" id="docs-internal-guid-…">`.
 *   - Bold, italic and the rest arrive as inline `style` on spans, not as tags.
 *   - A text colour of black or `windowtext`, carried over, vanishes on a dark
 *     theme.
 *
 * What survives: paragraphs, headings, lists, links, tables (see
 * spreadsheetPaste), images, bold, italic, underline, strikethrough,
 * superscript and subscript; text and highlight colours only when the toolbar
 * offers them, and only real colours, never black, white or grey.
 *
 * Kept free of TipTap and the editor so the tests can run it in Node.
 */
import { isWebImage } from './pastedImages';

export interface PasteCleanOptions {
  /** The toolbar has the text colour button: keep real text colours. */
  color: boolean;
  /** The toolbar has the highlight button: keep real highlight colours. */
  highlight: boolean;
}

/** HTML copied out of a ProseMirror editor (Scribe itself) is already clean. */
export function isEditorHtml(html: string): boolean {
  return /data-pm-slice=/.test(html);
}

const BOLD = /font-weight\s*:\s*(bold|bolder|[6-9]00)\b/i;
const NOT_BOLD = /font-weight\s*:\s*(normal|lighter|[1-4]00)\b/i;
const ITALIC = /font-style\s*:\s*italic\b/i;
const UNDERLINE = /text-decoration[\w-]*\s*:[^;]*\bunderline\b/i;
const STRIKE = /text-decoration[\w-]*\s*:[^;]*\bline-through\b/i;
const SUPER = /vertical-align\s*:\s*super\b/i;
const SUB = /vertical-align\s*:\s*sub\b/i;

/** Attributes worth keeping, by element. Everything else is styling. */
const KEEP: Record<string, string[]> = {
  a: ['href'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
  ol: ['start'],
};

const NAMED: Record<string, string> = {
  red: '#ff0000',
  darkred: '#8b0000',
  orange: '#ffa500',
  yellow: '#ffff00',
  green: '#008000',
  lime: '#00ff00',
  teal: '#008080',
  blue: '#0000ff',
  navy: '#000080',
  purple: '#800080',
  fuchsia: '#ff00ff',
  magenta: '#ff00ff',
  maroon: '#800000',
  olive: '#808000',
  aqua: '#00ffff',
  cyan: '#00ffff',
};

/**
 * A CSS colour as `#rrggbb`, or null when it is not one worth keeping.
 *
 * 🚨 Only colours with real hue. Office and Google Docs write `color: black`
 * (or `windowtext`, or `rgb(0,0,0)`) on every run of text, and a background
 * of white or `transparent`; kept, they are invisible on a dark theme and
 * mean nothing on a light one.
 */
export function pastedColor(value: string): string | null {
  const v = value.trim().toLowerCase();
  let r: number, g: number, b: number;

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(NAMED[v] ?? v);
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(v);

  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, '$&$&') : hex[1];
    [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  } else if (rgb && (rgb[4] === undefined || parseFloat(rgb[4]) > 0.5)) {
    [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number);
    if ([r, g, b].some((n) => n > 255)) return null;
  } else {
    return null;
  }

  if (Math.max(r, g, b) - Math.min(r, g, b) < 48) return null;

  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
}

function cssValue(style: string, property: string): string | null {
  const match = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;!]+)`, 'i').exec(style);
  return match ? match[1].trim() : null;
}

function unwrap(el: Element): void {
  el.replaceWith(...Array.from(el.childNodes));
}

function wrapChildren(parent: Element, wrapper: Element): void {
  while (parent.firstChild) wrapper.appendChild(parent.firstChild);
  parent.appendChild(wrapper);
}

function rename(el: Element, tag: string, doc: Document): Element {
  const next = doc.createElement(tag);
  while (el.firstChild) next.appendChild(el.firstChild);
  el.replaceWith(next);
  return next;
}

const blank = (el: Element) => (el.textContent || '').replace(/[\s\u00a0\u200b]+/g, '') === '' && !el.querySelector('img, table, hr');

/**
 * Cleans pasted HTML in place. Tables are left to cleanTableHtml, which runs
 * after this and needs their office styling to find the header row.
 */
export function cleanPastedHtml(doc: Document, options: PasteCleanOptions): void {
  const body = doc.body;
  const inTable = (el: Element) => !!el.closest('table');

  // Comments: Word's conditional `<!--[if !supportLists]-->` and fragment markers.
  const walker = doc.createTreeWalker(body, 128 /* NodeFilter.SHOW_COMMENT */);
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((c) => c.parentNode?.removeChild(c));

  body
    .querySelectorAll('script, meta, link, title, xml, template, noscript, iframe, object, embed, form, input, button, select, textarea')
    .forEach((el) => el.remove());

  // Google Docs' wrapper around the whole selection.
  body.querySelectorAll('b[id^="docs-internal-guid"]').forEach(unwrap);

  wordLists(doc);

  // Word's title styles are headings in all but name.
  body.querySelectorAll('p.MsoTitle').forEach((p) => rename(p, 'h1', doc));
  body.querySelectorAll('p.MsoSubtitle').forEach((p) => rename(p, 'h2', doc));
  // The editor has four heading levels.
  body.querySelectorAll('h5, h6').forEach((h) => rename(h, 'h4', doc));

  // Namespaced Office elements (<o:p>, <v:shape>…) carry nothing a post keeps.
  Array.from(body.querySelectorAll('*'))
    .filter((el) => el.tagName.includes(':'))
    .forEach((el) => (/^v:/i.test(el.tagName) ? el.remove() : unwrap(el)));

  // Inline styling becomes the tags the editor knows.
  Array.from(body.querySelectorAll('span, font, b, strong, i, em, a, sup, sub, u, s, p, li, h1, h2, h3, h4')).forEach((el) => {
    if (inTable(el)) return;
    const style = el.getAttribute('style') || '';
    const tag = el.tagName.toLowerCase();

    // `<b style="font-weight:normal">` is not bold (Google Docs, and others).
    if ((tag === 'b' || tag === 'strong') && NOT_BOLD.test(style)) {
      unwrap(el);
      return;
    }

    if (!style && tag !== 'font') return;

    const inline = tag === 'span' || tag === 'font';
    if (BOLD.test(style) && !/^h\d$/.test(tag) && tag !== 'b' && tag !== 'strong') wrapChildren(el, doc.createElement('strong'));
    if (ITALIC.test(style) && tag !== 'i' && tag !== 'em') wrapChildren(el, doc.createElement('em'));
    if (UNDERLINE.test(style) && !el.closest('a') && tag !== 'u') wrapChildren(el, doc.createElement('u'));
    if (STRIKE.test(style) && tag !== 's') wrapChildren(el, doc.createElement('s'));
    if (SUPER.test(style) && tag !== 'sup') wrapChildren(el, doc.createElement('sup'));
    else if (SUB.test(style) && tag !== 'sub') wrapChildren(el, doc.createElement('sub'));

    // A link's own colour and underline are how the source drew links, not formatting.
    const link = !!el.closest('a');
    const color = options.color && !link && pastedColor(cssValue(style, 'color') || (tag === 'font' ? el.getAttribute('color') || '' : ''));
    if (color) {
      const span = doc.createElement('span');
      span.setAttribute('data-color', color);
      wrapChildren(el, span);
    }

    const bg = cssValue(style, 'background-color') || cssValue(style, 'background') || cssValue(style, 'mso-highlight');
    const highlight = options.highlight && bg && pastedColor(bg);
    if (highlight) {
      const mark = doc.createElement('mark');
      mark.setAttribute('data-color', highlight);
      wrapChildren(el, mark);
    }

    if (inline) unwrap(el);
  });

  // A picture only the copier's tab or disk can see would be saved as raw text; see isWebImage.
  // An embedded one stays: pastedImages uploads those, and the editor drops the rest.
  body.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || '';
    if (!isWebImage(src) && !/^data:image\//i.test(src.trim())) img.remove();
  });

  // Every attribute not worth keeping goes; Scribe's own classes and data
  // attributes stay, so a spoiler copied out of a rendered post is still one.
  body.querySelectorAll('*').forEach((el) => {
    if (inTable(el) && el.tagName !== 'TABLE') return;
    const tag = el.tagName.toLowerCase();
    const keep = KEEP[tag] || [];

    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (keep.includes(name) || name.startsWith('data-')) continue;
      if (name === 'class') {
        const ours = attr.value.split(/\s+/).filter((c) => c.startsWith('Scribe-'));
        if (ours.length) {
          el.setAttribute('class', ours.join(' '));
          continue;
        }
      }
      el.removeAttribute(name);
    }
  });

  // Spacer paragraphs (Word) and the <br> between blocks (Google Docs).
  body.querySelectorAll('p, div').forEach((el) => {
    if (!inTable(el) && !el.closest('li') && blank(el) && !el.querySelector('img')) el.remove();
  });
  Array.from(body.children).forEach((el) => {
    if (el.tagName === 'BR') el.remove();
  });
}

/**
 * Word's lists, made real.
 *
 * Word writes each item as a paragraph styled `mso-list:l0 level1 lfo1`,
 * starting with its own marker ("·", "o", "1.", "a)") inside a span styled
 * `mso-list:Ignore`. A run of those paragraphs becomes a list, nested by
 * level, numbered when the marker is.
 */
function wordLists(doc: Document): void {
  const items: Element[] = Array.from(doc.body.querySelectorAll('p')).filter((p) =>
    /mso-list\s*:\s*l\d+\s+level\d/i.test(p.getAttribute('style') || '')
  );
  const done = new Set<Element>();

  for (const first of items) {
    if (done.has(first)) continue;

    // The run: consecutive list paragraphs, siblings with nothing between.
    const run: Element[] = [];
    for (let el: Element | null = first; el && items.includes(el); el = nextElement(el)) run.push(el);

    const stack: { level: number; list: Element }[] = [];
    const anchor = doc.createElement('div');
    first.before(anchor);

    for (const p of run) {
      done.add(p);
      const level = parseInt(/level(\d+)/i.exec(p.getAttribute('style') || '')![1], 10);
      const marker = p.querySelector('span[style*="mso-list"]');
      const markerText = (marker?.textContent || '').replace(/[\s\u00a0]+/g, '');
      const ordered = /^(\d+|[a-z]|[ivxlc]+)[.)]$/i.test(markerText);
      marker?.remove();

      while (stack.length && stack[stack.length - 1].level > level) stack.pop();
      let top = stack[stack.length - 1];

      if (!top || top.level < level) {
        const list = doc.createElement(ordered ? 'ol' : 'ul');
        if (top) {
          const parentItem = top.list.lastElementChild || top.list.appendChild(doc.createElement('li'));
          parentItem.appendChild(list);
        } else {
          anchor.appendChild(list);
        }
        top = { level, list };
        stack.push(top);
      }

      const li = doc.createElement('li');
      const para = doc.createElement('p');
      while (p.firstChild) para.appendChild(p.firstChild);
      // What is left of the marker's padding.
      while (para.firstChild && para.firstChild.nodeType === 3 && /^[\s\u00a0]*$/.test(para.firstChild.textContent || '')) para.firstChild.remove();
      li.appendChild(para);
      top.list.appendChild(li);
      p.remove();
    }

    unwrap(anchor);
  }
}

function nextElement(el: Element): Element | null {
  let next = el.nextSibling;
  while (next && next.nodeType !== 1) {
    if (next.nodeType === 3 && (next.textContent || '').trim() !== '') return null;
    next = next.nextSibling;
  }
  return next as Element | null;
}
