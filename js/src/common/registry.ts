import type { ScribeButton } from './toolbarButtons';

/**
 * The bits of TipTap handed to a registered extension factory.
 *
 * 🚨 This object is the whole reason factories exist instead of plain
 * extension objects. TipTap and ProseMirror are ~430KB and Scribe keeps them
 * behind a dynamic import (see forum/tiptap/boot.ts) so a visitor who never
 * opens the composer never downloads them. An extension that imported
 * `@tiptap/core` itself to build a Node would pull that weight into ITS bundle,
 * which Flarum loads eagerly on every page — undoing the split from the
 * outside, silently, with nothing but a slower forum to show for it.
 *
 * So a registering extension declares no TipTap dependency at all. It hands
 * over a function, and Scribe calls it with these primitives at the moment the
 * editor is actually being built.
 */
export interface ScribeTiptapKit {
  Node: typeof import('@tiptap/core').Node;
  Mark: typeof import('@tiptap/core').Mark;
  Extension: typeof import('@tiptap/core').Extension;
  mergeAttributes: typeof import('@tiptap/core').mergeAttributes;
}

/** Returns a TipTap Node, Mark or Extension, built from the kit it is given. */
export type ScribeExtensionFactory = (tiptap: ScribeTiptapKit) => any;

const extensionFactories: ScribeExtensionFactory[] = [];
const extraButtons: ScribeButton[] = [];

/**
 * Teach the editor a new node, mark or behaviour.
 *
 * Call this from an initializer. The factory runs later — once, when a composer
 * is first opened — so registering is cheap and costs a visitor who never posts
 * nothing at all.
 *
 * 🚨 Whatever the node's `renderHTML` emits has to survive the formatter. Scribe
 * parses stored post HTML through a CLOSED element list
 * (src/Formatter/Vocabulary.php); anything outside it is dropped at PARSE time,
 * silently — the post saves, and the content is simply gone. An extension adding
 * a node must also register its element server-side, by loading s9e's
 * HTMLElements plugin from its own Formatter configure callback and aliasing
 * that element onto its own tag. The two are one change written in two files;
 * shipping either half alone looks like it works right up until a post is saved.
 */
export function registerExtension(factory: ScribeExtensionFactory): void {
  extensionFactories.push(factory);
}

/**
 * Add a button to the composer toolbar.
 *
 * Set `translationKey` — a bare `label` is resolved under Scribe's own
 * translation namespace, which an extension has no entries in.
 *
 * 🚨 `prompt` is Scribe-internal: it names one of the inline forms this
 * toolbar knows how to draw, and a value it doesn't recognise opens an empty
 * row. A button that needs to ask for something should give a `run` that opens
 * its own modal (`app.modal.show(...)`) instead.
 */
export function registerButton(button: ScribeButton): void {
  extraButtons.push(button);
}

export function registeredExtensions(): readonly ScribeExtensionFactory[] {
  return extensionFactories;
}

export function registeredButtons(): readonly ScribeButton[] {
  return extraButtons;
}
