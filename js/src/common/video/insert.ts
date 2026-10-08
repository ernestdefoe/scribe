import type { Editor } from '@tiptap/core';
import type { VideoRef } from './parse';

/*
 * 🚨 A type-only import of TipTap, and it must stay that way. The toolbar lives
 * in forum.js, which every visitor downloads; a value import of @tiptap/* from
 * here would drag the whole editor out of its lazy chunk and into that bundle.
 */

/**
 * Put a video where `range` is (or at the cursor), followed by an empty
 * paragraph when it would otherwise be the last thing in the post — an atom at
 * the very end leaves nowhere to click to keep typing.
 */
export function insertVideo(editor: Editor, ref: VideoRef & { caption?: string }, range?: { from: number; to: number }): boolean {
  const attrs = { provider: ref.provider, id: ref.id, start: ref.start ?? null };
  const caption = (ref.caption ?? '').replace(/[\r\n]+/g, ' ');
  const content: any[] = [{ type: 'scribeVideo', attrs, content: caption ? [{ type: 'text', text: caption }] : [] }];

  const end = range ? range.to : editor.state.selection.to;
  const atEnd = end >= editor.state.doc.content.size - 1;
  if (atEnd) content.push({ type: 'paragraph' });

  const chain = editor.chain().focus();
  return range ? chain.insertContentAt(range, content).run() : chain.insertContent(content).run();
}
