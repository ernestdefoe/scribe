import type { Editor } from '@tiptap/core';
import { registeredButtons } from './registry';

/** scribeAlign is a global attribute, not a mark/node — check every host type. */
function isAlign(e: Editor, align: string): boolean {
  return (
    e.getAttributes('paragraph').align === align ||
    e.getAttributes('heading').align === align ||
    e.getAttributes('scribeImageAlign').align === align
  );
}

export interface ScribeButton {
  key: string;
  icon: string;
  /** Translation key suffix under ernestdefoe-scribe.forum.composer */
  label: string;
  /**
   * A FULL translation key, used verbatim instead of `label`.
   *
   * For buttons registered by other extensions, which have no entries under
   * Scribe's namespace — without this their tooltip renders as the raw key.
   */
  translationKey?: string;
  /** Whether the mark/node is active at the cursor, for the pressed state. */
  active?: (e: Editor) => boolean;
  /** Whether the command can run right now, for the disabled state. */
  enabled?: (e: Editor) => boolean;
  /** Absent when the button opens a form instead of acting immediately. */
  run?: (e: Editor) => void;
  /** Opens a form rather than toggling immediately. */
  prompt?: 'link' | 'image' | 'color' | 'highlight' | 'spoiler' | 'info' | 'table' | 'alignMenu' | 'tableMenu';
  /**
   * A short suffix drawn on the icon.
   *
   * 🚨 Heading and Subheading share Font Awesome's only heading glyph, so
   * side by side in the toolbar they were two identical buttons doing
   * different things — the tooltip was the only way to tell them apart.
   */
  badge?: string;
}

/**
 * Every button Scribe can show. The AdminCP decides which of these are on and
 * in what order; nothing here assumes it is visible.
 *
 * 🚨 A button that is registered but never wired is worse than a missing one —
 * it looks like a feature and does nothing. Each entry carries its own `run`,
 * so adding a key to the registry is the same act as making it work.
 */
export const SCRIBE_BUTTONS: ScribeButton[] = [
  { key: 'bold', icon: 'fas fa-bold', label: 'bold',
    active: (e) => e.isActive('bold'), run: (e) => e.chain().focus().toggleBold().run() },
  { key: 'italic', icon: 'fas fa-italic', label: 'italic',
    active: (e) => e.isActive('italic'), run: (e) => e.chain().focus().toggleItalic().run() },
  { key: 'underline', icon: 'fas fa-underline', label: 'underline',
    active: (e) => e.isActive('underline'), run: (e) => e.chain().focus().toggleUnderline().run() },
  { key: 'strike', icon: 'fas fa-strikethrough', label: 'strike',
    active: (e) => e.isActive('strike'), run: (e) => e.chain().focus().toggleStrike().run() },
  { key: 'code', icon: 'fas fa-code', label: 'code',
    active: (e) => e.isActive('code'), run: (e) => e.chain().focus().toggleCode().run() },
  { key: 'superscript', icon: 'fas fa-superscript', label: 'superscript',
    active: (e) => e.isActive('superscript'), run: (e) => e.chain().focus().toggleSuperscript().run() },
  { key: 'subscript', icon: 'fas fa-subscript', label: 'subscript',
    active: (e) => e.isActive('subscript'), run: (e) => e.chain().focus().toggleSubscript().run() },
  { key: 'color', icon: 'fas fa-palette', label: 'text_color', prompt: 'color',
    active: (e) => e.isActive('scribeColor') },
  { key: 'highlight', icon: 'fas fa-highlighter', label: 'highlight', prompt: 'highlight',
    active: (e) => e.isActive('highlight') },
  { key: 'heading1', icon: 'fas fa-heading', label: 'heading1', badge: '1',
    active: (e) => e.isActive('heading', { level: 1 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { key: 'heading2', icon: 'fas fa-heading', label: 'heading', badge: '2',
    active: (e) => e.isActive('heading', { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { key: 'heading3', icon: 'fas fa-heading', label: 'subheading', badge: '3',
    active: (e) => e.isActive('heading', { level: 3 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { key: 'heading4', icon: 'fas fa-heading', label: 'heading4', badge: '4',
    active: (e) => e.isActive('heading', { level: 4 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 4 }).run() },
  { key: 'bulletList', icon: 'fas fa-list-ul', label: 'bullet_list',
    active: (e) => e.isActive('bulletList'), run: (e) => e.chain().focus().toggleBulletList().run() },
  { key: 'orderedList', icon: 'fas fa-list-ol', label: 'ordered_list',
    active: (e) => e.isActive('orderedList'), run: (e) => e.chain().focus().toggleOrderedList().run() },
  { key: 'blockquote', icon: 'fas fa-quote-left', label: 'quote',
    active: (e) => e.isActive('blockquote'), run: (e) => e.chain().focus().toggleBlockquote().run() },
  { key: 'align', icon: 'fas fa-align-left', label: 'align', prompt: 'alignMenu',
    active: (e) => isAlign(e, 'left') || isAlign(e, 'center') || isAlign(e, 'right') || isAlign(e, 'justify') },
  { key: 'codeBlock', icon: 'fas fa-file-code', label: 'code_block',
    active: (e) => e.isActive('codeBlock'), run: (e) => e.chain().focus().toggleCodeBlock().run() },
  { key: 'spoiler', icon: 'fas fa-eye-slash', label: 'spoiler', prompt: 'spoiler',
    active: (e) => e.isActive('scribeSpoiler') },
  { key: 'info', icon: 'fas fa-circle-info', label: 'info_box', prompt: 'info',
    active: (e) => e.isActive('scribeInfo') },
  { key: 'replyGate', icon: 'fas fa-lock', label: 'reply_gate',
    active: (e) => e.isActive('scribeReply'), run: (e) => e.chain().focus().wrapIn('scribeReply').run() },
  { key: 'link', icon: 'fas fa-link', label: 'link', prompt: 'link',
    active: (e) => e.isActive('link') },
  { key: 'image', icon: 'fas fa-image', label: 'image', prompt: 'image' },
  { key: 'table', icon: 'fas fa-table', label: 'table', prompt: 'tableMenu' },
  { key: 'horizontalRule', icon: 'fas fa-minus', label: 'horizontal_rule',
    run: (e) => e.chain().focus().setHorizontalRule().run() },
  { key: 'undo', icon: 'fas fa-undo', label: 'undo',
    enabled: (e) => e.can().undo(), run: (e) => e.chain().focus().undo().run() },
  { key: 'redo', icon: 'fas fa-redo', label: 'redo',
    enabled: (e) => e.can().redo(), run: (e) => e.chain().focus().redo().run() },
];

/** Shown when the admin has never touched the setting. */
export const DEFAULT_TOOLBAR = [
  'bold', 'italic', 'strike', 'code',
  'heading2', 'bulletList', 'orderedList', 'blockquote', 'codeBlock',
  'link', 'image',
];

/**
 * The four options behind the "align" toolbar entry's dropdown. Not part of
 * SCRIBE_BUTTONS — the admin toolbar builder shouldn't offer these as four
 * separate slots to drag in individually, that's exactly the clutter the
 * group button exists to avoid.
 */
export const ALIGN_ACTIONS: ScribeButton[] = [
  { key: 'alignLeft', icon: 'fas fa-align-left', label: 'align_left',
    active: (e) => isAlign(e, 'left'), run: (e) => (e.chain().focus() as any).setAlign('left').run() },
  { key: 'alignCenter', icon: 'fas fa-align-center', label: 'align_center',
    active: (e) => isAlign(e, 'center'), run: (e) => (e.chain().focus() as any).setAlign('center').run() },
  { key: 'alignRight', icon: 'fas fa-align-right', label: 'align_right',
    active: (e) => isAlign(e, 'right'), run: (e) => (e.chain().focus() as any).setAlign('right').run() },
  { key: 'alignJustify', icon: 'fas fa-align-justify', label: 'align_justify',
    active: (e) => isAlign(e, 'justify'), run: (e) => (e.chain().focus() as any).setAlign('justify').run() },
];

/**
 * The row/column/header actions behind the "table" toolbar entry's
 * dropdown, alongside its own size-picker prompt (kind 'table', handled
 * separately in ScribeToolbar since it needs number inputs, not just an
 * icon click). Same reasoning as ALIGN_ACTIONS above — not in SCRIBE_BUTTONS.
 */
export const TABLE_ACTIONS: ScribeButton[] = [
  { key: 'toggleHeaderCell', icon: 'fas fa-table-cells', label: 'toggle_header_cell',
    active: (e) => e.isActive('tableHeader'),
    enabled: (e) => e.can().toggleHeaderCell(),
    run: (e) => (e.chain().focus() as any).toggleHeaderCell().run() },
  { key: 'addRowAfter', icon: 'fas fa-table-list', label: 'add_row', badge: '+',
    enabled: (e) => e.can().addRowAfter(), run: (e) => e.chain().focus().addRowAfter().run() },
  { key: 'deleteRow', icon: 'fas fa-table-list', label: 'delete_row', badge: '−',
    enabled: (e) => e.can().deleteRow(), run: (e) => e.chain().focus().deleteRow().run() },
  { key: 'addColumnAfter', icon: 'fas fa-table-columns', label: 'add_column', badge: '+',
    enabled: (e) => e.can().addColumnAfter(), run: (e) => e.chain().focus().addColumnAfter().run() },
  { key: 'deleteColumn', icon: 'fas fa-table-columns', label: 'delete_column', badge: '−',
    enabled: (e) => e.can().deleteColumn(), run: (e) => e.chain().focus().deleteColumn().run() },
];

/**
 * Scribe's own buttons plus any another extension has registered.
 *
 * 🚨 Every consumer of the button list must go through this, not
 * SCRIBE_BUTTONS. A registered button missing from the admin builder can't be
 * added to the toolbar; missing from `buttonsFor` it is dropped as an unknown
 * key even after it has been; and missing from the driver's active-state
 * signature its pressed state never refreshes. Three different ways for a
 * button to be registered and still not work.
 */
export function allButtons(): ScribeButton[] {
  return [...SCRIBE_BUTTONS, ...registeredButtons()];
}

export function buttonsFor(keys: string[]): ScribeButton[] {
  const byKey = new Map(allButtons().map((b) => [b.key, b]));
  // Unknown keys are dropped rather than rendered blank — a setting saved by an
  // older version must not leave a dead control in the toolbar.
  return keys.map((k) => byKey.get(k)).filter((b): b is ScribeButton => !!b);
}
