/**
 * Markdown PASTED as plain text, turned into formatting.
 *
 * 🚨 Paste only, and only when it clearly is Markdown. Typing `**bold**` in
 * Scribe stays literal — that is the point of a WYSIWYG editor, and nothing
 * here changes it (see legacyInsert.ts). This is for the other case: a
 * README, notes from another forum, or a chatbot's answer, copied as text and
 * pasted whole. Formatted HTML on the clipboard always wins over this, and
 * Ctrl/⌘+Shift+V still pastes the characters exactly as copied.
 *
 * The output is HTML for the editor's own parser, so anything the editor has
 * no node for is dropped there, and links and images keep to http(s),
 * mailto and root-relative addresses.
 *
 * Kept free of TipTap and the editor so the tests can run it in Node.
 */

const FENCE = /^\s{0,3}(```|~~~)\s*([\w+#.-]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const LINK = /\[[^\]\n]+\]\((?:https?:\/\/|\/|mailto:)[^)\s]+\)/;

/**
 * Whether plain text reads as Markdown.
 *
 * One strong sign is enough — a code fence, a heading, a table or a
 * `[label](url)` link. Weaker ones (list items, quote lines, `**bold**`,
 * `` `code` ``) need two, so a single "- " line or a lone pair of asterisks
 * stays text. Text where most lines end in `;`, `{` or `}` is code, whatever
 * else it holds: a shell script's `# comment` is not a heading.
 */
export function looksLikeMarkdown(text: string): boolean {
  const lines = text.split(/\r?\n/);
  const filled = lines.filter((l) => l.trim() !== '');
  if (!filled.length) return false;

  if (filled.filter((l) => /[;{}]\s*$/.test(l)).length > filled.length * 0.3) return false;

  let strong = 0;
  let weak = 0;

  for (const line of filled) {
    if (FENCE.test(line) || HEADING.test(line) || TABLE_SEP.test(line)) strong++;
    else if (ITEM.test(line) || QUOTE.test(line)) weak++;
  }
  if (LINK.test(text)) strong++;
  weak += (text.match(/\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`/g) || []).length;

  return strong >= 1 || weak >= 2;
}

/**
 * Whether clipboard HTML is only plain text in a costume.
 *
 * VS Code, and most code editors, put their syntax colouring on the clipboard
 * as HTML: divs, spans and line breaks, nothing structural. A Markdown file
 * copied from one of those is still plain Markdown and should be read as it.
 */
export function isStyledPlainText(html: string): boolean {
  return !/<(?!\/?(?:meta|div|span|br|pre|code|html|head|body|style|font)\b)[a-z]/i.test(html);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Only http(s), mailto and root-relative targets; never javascript: or data:. */
function safeUrl(url: string): string | null {
  const u = url.trim();
  if (u.startsWith('/') && !u.startsWith('//')) return u;
  return /^(https?:\/\/|mailto:)/i.test(u) ? u : null;
}

/**
 * Reading a post's stored source (legacySource.ts) rather than a paste: a
 * line break inside a paragraph is a <br>, as Flarum rendered it, and the
 * extras Flarum's Markdown and fof/rich-text wrote (`^sup^`, `~sub~`) and
 * BBCode count too. Set only for the length of one markdownToHtml() call.
 */
let legacy = false;

/** Inline Markdown: code spans, images, links, bold, italic, strikethrough. */
export function inlineMarkdown(text: string): string {
  // Code spans first, held aside, so nothing inside them is formatted.
  const codes: string[] = [];
  let out = text.replace(/`([^`\n]+)`/g, (_, code) => `\u0000${codes.push(code) - 1}\u0000`);

  // A backslash makes the next mark literal (`\*` is an asterisk): held aside too.
  const escaped: string[] = [];
  out = out.replace(/\\([\\`*_{}[\]()#+\-.!~|>^<])/g, (_, ch) => `\u0001${escaped.push(ch) - 1}\u0001`);

  out = escapeHtml(out);

  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (whole, alt, src) => {
    const safe = safeUrl(src.replace(/&amp;/g, '&'));
    return safe ? `<img src="${escapeHtml(safe)}" alt="${alt}">` : whole;
  });
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label, href) => {
    const safe = safeUrl(href.replace(/&amp;/g, '&'));
    return safe ? `<a href="${escapeHtml(safe)}">${label}</a>` : whole;
  });
  out = out.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, (_, url) => `<a href="${url}">${url}</a>`);

  out = out.replace(/(\*\*|__)(?=\S)([^\n]*?\S)\1/g, '<strong>$2</strong>');
  out = out.replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\*)/g, '$1<em>$2</em>');
  out = out.replace(/(^|[^\w_])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1<em>$2</em>');
  out = out.replace(/~~(?=\S)([^~\n]*?\S)~~/g, '<s>$1</s>');

  if (legacy) {
    out = out.replace(/\^(?=\S)([^^\s]+)\^/g, '<sup>$1</sup>');
    out = out.replace(/(^|[^~])~(?=\S)([^~\s]+)~(?!~)/g, '$1<sub>$2</sub>');
    out = bbcodeInline(out);
  }

  return out
    .replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[+i])}</code>`)
    .replace(/\u0001(\d+)\u0001/g, (_, i) => escapeHtml(escaped[+i]));
}

/**
 * Inline BBCode (flarum/bbcode), on text already HTML-escaped. Tags with no
 * counterpart in a post ([color], [size], [center]) keep their text and lose
 * the tag.
 */
function bbcodeInline(out: string): string {
  const pairs: Record<string, string> = { b: 'strong', i: 'em', u: 'u', s: 's', del: 's', sup: 'sup', sub: 'sub' };
  for (const [tag, html] of Object.entries(pairs)) {
    out = out.replace(new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[/${tag}\\]`, 'gi'), `<${html}>$1</${html}>`);
  }
  out = out.replace(/\[url=([^\]\s]+)\]([\s\S]*?)\[\/url\]/gi, (whole, href, label) => {
    const safe = safeUrl(href.replace(/&amp;/g, '&').replace(/^&quot;|&quot;$/g, ''));
    return safe ? `<a href="${escapeHtml(safe)}">${label}</a>` : whole;
  });
  out = out.replace(/\[url\]([^\[\s]+)\[\/url\]/gi, (whole, href) => {
    const safe = safeUrl(href.replace(/&amp;/g, '&'));
    return safe ? `<a href="${escapeHtml(safe)}">${href}</a>` : whole;
  });
  out = out.replace(/\[img\]([^\[\s]+)\[\/img\]/gi, (whole, src) => {
    const safe = safeUrl(src.replace(/&amp;/g, '&'));
    return safe ? `<img src="${escapeHtml(safe)}" alt="">` : whole;
  });
  return out.replace(/\[\/?(?:color|size|center|left|right|font)(?:=[^\]]*)?\]/gi, '');
}

function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/** Markdown as HTML in the shapes the editor parses. */
export function markdownToHtml(text: string, options: { legacy?: boolean } = {}): string {
  legacy = !!options.legacy;
  try {
    return blocks(text.replace(/\r\n?/g, '\n').split('\n'));
  } finally {
    legacy = false;
  }
}

function blocks(lines: string[]): string {
  const out: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p>${para.map(inlineMarkdown).join(legacy ? '<br>' : ' ')}</p>`);
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === '') {
      flush();
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      flush();
      const body: string[] = [];
      for (i++; i < lines.length && !new RegExp(`^\\s{0,3}${fence[1]}\\s*$`).test(lines[i]); i++) body.push(lines[i]);
      const lang = fence[2] ? ` data-lang="${escapeHtml(fence[2].toLowerCase())}"` : '';
      out.push(`<pre${lang}><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const level = Math.min(heading[1].length, 4);
      out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (RULE.test(line) && !(para.length && /^\s*-+\s*$/.test(line))) {
      flush();
      out.push('<hr>');
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      flush();
      const head = cells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && lines[i].includes('|') && lines[i].trim() !== ''; i++) rows.push(cells(lines[i]));
      i--;
      const cell = (tag: string, c: string) => `<${tag}><p>${inlineMarkdown(c)}</p></${tag}>`;
      out.push(
        '<table><tbody>' +
          `<tr>${head.map((c) => cell('th', c)).join('')}</tr>` +
          rows.map((r) => `<tr>${head.map((_, j) => cell('td', r[j] ?? '')).join('')}</tr>`).join('') +
          '</tbody></table>'
      );
      continue;
    }

    if (QUOTE.test(line)) {
      flush();
      const quoted: string[] = [];
      for (; i < lines.length && QUOTE.test(lines[i]); i++) quoted.push(QUOTE.exec(lines[i])![1]);
      i--;
      out.push(`<blockquote>${blocks(quoted)}</blockquote>`);
      continue;
    }

    if (ITEM.test(line)) {
      flush();
      const run: string[] = [];
      for (; i < lines.length && (ITEM.test(lines[i]) || (/^\s+\S/.test(lines[i]) && run.length)); i++) run.push(lines[i]);
      i--;
      out.push(list(run));
      continue;
    }

    para.push(line.trim());
  }

  flush();
  return out.join('');
}

/** A run of list lines, nested by indentation. */
function list(lines: string[]): string {
  const first = ITEM.exec(lines[0])!;
  const indent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const start = ordered ? parseInt(first[2], 10) : 1;
  const items: string[][] = [];

  for (const line of lines) {
    const item = ITEM.exec(line);
    if (item && item[1].length <= indent) items.push([item[3]]);
    else if (items.length) items[items.length - 1].push(line);
  }

  const html = items
    .map(([text, ...rest]) => {
      const nested = rest.filter((l) => l.trim() !== '');
      const child =
        nested.length && ITEM.test(nested[0]) ? list(nested) : nested.length ? `<p>${nested.map((l) => inlineMarkdown(l.trim())).join(' ')}</p>` : '';
      return `<li><p>${inlineMarkdown(text.replace(/^\[[ xX]\]\s+/, (m) => (/x/i.test(m) ? '☑ ' : '☐ ')))}</p>${child}</li>`;
    })
    .join('');

  return ordered ? `<ol${start !== 1 ? ` start="${start}"` : ''} data-type="decimal">${html}</ol>` : `<ul>${html}</ul>`;
}
