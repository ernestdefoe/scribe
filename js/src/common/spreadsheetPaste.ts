/**
 * Cells copied from a spreadsheet, pasted as a table.
 *
 * 🚨 EXCEL PASTED AS A PICTURE (Wil Vincent, 2026-10-19). Excel, Google
 * Sheets, LibreOffice Calc and Numbers put the same cells on the clipboard
 * three ways at once: an HTML <table>, tab-separated text, AND a bitmap of the
 * cells. FoF Upload's paste listener takes any image it finds, so on a forum
 * running it the AP Poll went up as `image.png` and the table never arrived.
 * When the clipboard holds a table, the table is what the person copied; the
 * bitmap is only there for apps that cannot take anything better.
 *
 * Kept free of TipTap and the editor so the tests can run it in Node.
 */

const TABLE = /<table[\s>]/i;

/** Whether pasted HTML carries a table. */
export function hasTable(html: string): boolean {
  return !!html && TABLE.test(html);
}

/**
 * Tab-separated text as rows of cells, or null when it is not a grid.
 *
 * A grid is two or more lines with the same number of cells, at least two
 * each. Excel quotes a cell holding a line break or a quote mark, so quoted
 * cells are read the way Excel writes them. Text whose first column is empty
 * on every line is indentation, not a table.
 */
export function tsvRows(text: string): string[][] | null {
  if (!text || text.indexOf('\t') === -1) return null;

  const s = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;

  for (;;) {
    let cell: string | null = null;

    if (s[i] === '"') {
      let j = i + 1;
      let out = '';
      while (j < s.length) {
        if (s[j] === '"') {
          if (s[j + 1] === '"') {
            out += '"';
            j += 2;
            continue;
          }
          break;
        }
        out += s[j++];
      }
      // Only a real quoted cell: the closing quote ends the cell.
      if (j < s.length && (j + 1 === s.length || s[j + 1] === '\t' || s[j + 1] === '\n')) {
        cell = out;
        i = j + 1;
      }
    }

    if (cell === null) {
      let j = i;
      while (j < s.length && s[j] !== '\t' && s[j] !== '\n') j++;
      cell = s.slice(i, j);
      i = j;
    }

    row.push(cell);

    if (i >= s.length) {
      rows.push(row);
      break;
    }
    if (s[i] === '\n') {
      rows.push(row);
      row = [];
    }
    i++;
  }

  const width = rows[0].length;
  if (rows.length < 2 || width < 2) return null;
  if (rows.some((r) => r.length !== width)) return null;
  if (rows.every((r) => r[0].trim() === '')) return null;

  return rows;
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Rows of plain text as table HTML in Scribe's own shape. */
export function tsvToTableHtml(rows: string[][]): string {
  const body = rows.map((r) => '<tr>' + r.map((c) => `<td><p>${escape(c.trim()).replace(/\n/g, '<br>')}</p></td>`).join('') + '</tr>').join('');

  return `<table><tbody>${body}</tbody></table>`;
}

const BOLD = /font-weight\s*:\s*(bold|bolder|[6-9]00)\b/i;
const ITALIC = /font-style\s*:\s*italic\b/i;
/** Elements that only carry styling; their text stays, they go. */
const WRAPPERS = 'span, font, google-sheets-html-origin';
/** Attributes worth keeping inside a cell. Everything else is office styling. */
const KEEP: Record<string, string[]> = { a: ['href'], td: ['colspan', 'rowspan', 'colwidth'], th: ['colspan', 'rowspan', 'colwidth'] };

/**
 * Pasted table HTML, cleaned down to what a post can hold.
 *
 * Office HTML styles cells through a stylesheet (`.xl65 {font-weight:700}`),
 * inline styles and `<font>` tags, sets fixed column widths in a <colgroup>,
 * and fills empty cells with `&nbsp;`. Scribe stores none of that, and a black
 * text colour carried over would vanish on a dark theme. What survives: the
 * cells, merged cells, bold and italic. Alignment does not: a post stores a
 * cell's `align`, the editor writes a style, so it would show while writing
 * and be gone once posted. A first row that is bold above rows that are not becomes the header row. A
 * single copied cell is just its text.
 */
export function cleanTableHtml(html: string, doc: Document): string {
  if (!hasTable(html)) return html;

  // Excel's stylesheet: which class makes a cell bold or italic.
  const classCss: Record<string, string> = {};
  doc.querySelectorAll('style').forEach((style) => {
    const css = (style.textContent || '').replace(/<!--|-->/g, '');
    for (const m of css.matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) classCss[m[1]] = (classCss[m[1]] || '') + ';' + m[2];
  });

  const body = doc.body;
  body.querySelectorAll('style, meta, link, title, colgroup, col').forEach((el) => el.remove());

  const styleOf = (el: Element) =>
    Array.from(el.classList)
      .map((c) => classCss[c] || '')
      .join(';') +
    ';' +
    (el.getAttribute('style') || '');

  body.querySelectorAll('table').forEach((table) => {
    const cells = Array.from(table.querySelectorAll('td, th'));
    const looks = new Map<Element, { bold: boolean; italic: boolean }>();

    for (const cell of cells) {
      const css = styleOf(cell);
      tidyCell(cell, styleOf, doc);
      looks.set(cell, {
        bold: cell.tagName === 'TH' || BOLD.test(css) || allInBold(cell),
        italic: ITALIC.test(css),
      });
    }

    // One cell is a value, not a table.
    if (cells.length === 1) {
      const p = doc.createElement('p');
      p.innerHTML = cells[0].innerHTML;
      table.replaceWith(p);
      return;
    }

    const rows = Array.from(table.querySelectorAll('tr'));
    const allBold = (r: Element) => {
      const c = Array.from(r.children).filter((e) => looks.has(e));
      return c.length > 0 && c.every((e) => looks.get(e)!.bold);
    };
    const header = rows.length > 1 && allBold(rows[0]) && !rows.slice(1).every(allBold);

    for (const el of [table, ...Array.from(table.querySelectorAll('thead, tbody, tfoot, tr'))]) {
      Array.from(el.attributes).forEach((a) => el.removeAttribute(a.name));
    }

    for (const cell of cells) {
      const look = looks.get(cell)!;

      for (const a of ['colspan', 'rowspan']) if (cell.getAttribute(a) === '1') cell.removeAttribute(a);

      let target: Element = cell;
      if (header && cell.parentElement === rows[0] && cell.tagName !== 'TH') {
        target = doc.createElement('th');
        Array.from(cell.attributes).forEach((a) => target.setAttribute(a.name, a.value));
        while (cell.firstChild) target.appendChild(cell.firstChild);
        cell.replaceWith(target);
      }

      if (target.firstChild) {
        if (look.italic) wrapChildren(target, doc.createElement('em'));
        if (look.bold && target.tagName !== 'TH' && !target.querySelector('b, strong')) wrapChildren(target, doc.createElement('strong'));
      }
    }
  });

  body.querySelectorAll(WRAPPERS).forEach(unwrap);

  return body.innerHTML.trim();
}

function unwrap(el: Element): void {
  el.replaceWith(...Array.from(el.childNodes));
}

function wrapChildren(parent: Element, wrapper: Element): void {
  if (!parent.firstChild) return;
  while (parent.firstChild) wrapper.appendChild(parent.firstChild);
  parent.appendChild(wrapper);
}

/**
 * A cell's contents without office styling: a span or <font> that made its
 * text bold or italic becomes <strong> or <em>, the rest unwrap, every
 * attribute not worth keeping goes, and a cell holding only &nbsp; is empty.
 */
function tidyCell(cell: Element, styleOf: (el: Element) => string, doc: Document): void {
  cell.querySelectorAll(WRAPPERS).forEach((el) => {
    const css = styleOf(el);
    if (ITALIC.test(css)) wrapChildren(el, doc.createElement('em'));
    if (BOLD.test(css)) wrapChildren(el, doc.createElement('strong'));
    unwrap(el);
  });

  for (const el of [cell, ...Array.from(cell.querySelectorAll('*'))]) {
    const keep = KEEP[el.tagName.toLowerCase()] || [];
    Array.from(el.attributes).forEach((a) => keep.includes(a.name) || el.removeAttribute(a.name));
  }

  if (!cell.querySelector('img, br') && text(cell) === '') cell.innerHTML = '';
}

const text = (el: Element) => (el.textContent || '').replace(/[\s\u00a0]+/g, '');

/** Whether every character in the cell is inside <b> or <strong>. */
function allInBold(cell: Element): boolean {
  const all = text(cell);
  if (all === '') return false;
  const bold = Array.from(cell.querySelectorAll('b, strong'))
    .filter((b) => !b.parentElement?.closest('b, strong'))
    .map(text)
    .join('');
  return bold === all;
}
