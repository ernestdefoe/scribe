/**
 * Everything that pulls TipTap into the build lives behind this module, and
 * nothing imports it statically.
 *
 * 🚨 This file IS the performance design. TipTap and ProseMirror are ~430KB
 * minified; bundled into forum.js they are downloaded, parsed and executed by
 * every visitor on every page view, including people who never open the
 * composer and guests who cannot post at all. Splitting it behind a dynamic
 * import means a forum page costs nothing for an editor nobody opened.
 */
import { Editor, type EditorOptions } from '@tiptap/core';
import { buildExtensions } from '../../common/tiptap/extensions';

export function createEditor(options: Omit<EditorOptions, 'extensions'> & { placeholder: string }) {
  const { placeholder, ...rest } = options;
  return new Editor({ ...rest, extensions: buildExtensions(placeholder) } as Partial<EditorOptions>);
}

export type { Editor };
export { cleanTableHtml, hasTable, tsvRows, tsvToTableHtml } from '../../common/spreadsheetPaste';
