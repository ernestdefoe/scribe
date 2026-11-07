/**
 * The `/` quick-insert menu, the parts that are only text.
 *
 * Kept free of TipTap so the tests can run it in Node; tiptap/slashMenu.ts
 * draws the menu.
 */

/**
 * The `/query` typed just before the cursor, or null.
 *
 * Only a `/` at the start of the line or after a space opens the menu, so a
 * path (`/usr/bin`), a date (`1/2`), a URL or "and/or" never does. The query
 * stops at the first space: the menu closes once the person carries on writing.
 *
 * @param before the paragraph's text up to the cursor
 * @returns the query and how many characters `/query` takes up
 */
export function slashQuery(before: string): { query: string; length: number } | null {
  const match = /(?:^|\s)\/([^\s/]{0,24})$/.exec(before);
  return match ? { query: match[1], length: match[1].length + 1 } : null;
}

/**
 * The items whose label or key matches the query, best first: an item whose
 * label (or one of its words) starts with the query, then one that merely
 * contains it.
 */
export function filterSlashItems<T extends { key: string; label: string }>(items: readonly T[], query: string): T[] {
  const q = query.toLocaleLowerCase();
  if (!q) return [...items];

  const starts: T[] = [];
  const contains: T[] = [];

  for (const item of items) {
    const label = item.label.toLocaleLowerCase();
    if (label.startsWith(q) || label.split(/\s+/).some((w) => w.startsWith(q))) starts.push(item);
    else if (label.includes(q) || item.key.toLowerCase().includes(q)) contains.push(item);
  }

  return [...starts, ...contains];
}
