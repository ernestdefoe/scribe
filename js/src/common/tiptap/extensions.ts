import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Strike from '@tiptap/extension-strike';
import Underline from '@tiptap/extension-underline';
import Code from '@tiptap/extension-code';
import CodeBlock from '@tiptap/extension-code-block';
import Heading from '@tiptap/extension-heading';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import Blockquote from '@tiptap/extension-blockquote';
import HardBreak from '@tiptap/extension-hard-break';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Highlight from '@tiptap/extension-highlight';
import History from '@tiptap/extension-history';
import Dropcursor from '@tiptap/extension-dropcursor';
import Gapcursor from '@tiptap/extension-gapcursor';
import Placeholder from '@tiptap/extension-placeholder';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import { TextStyle } from '@tiptap/extension-text-style';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { Extension, Mark, Node, mergeAttributes } from '@tiptap/core';
import { registeredExtensions } from '../registry';

/**
 * A colour is stored in `data-color` and filtered server-side by s9e's #color.
 *
 * 🚨 Deliberately NOT TipTap's own Color extension, which writes
 * `style="color: …"`. A style string has to be re-parsed and sanitised on the
 * server before it can be trusted, and "red;background:url(…)" looks like an
 * ordinary colour right up until it isn't. A bare attribute has one meaning and
 * one filter.
 */
export const ScribeColor = Mark.create({
  name: 'scribeColor',
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-color'),
        /*
         * `style` here is a live-editor convenience only — the server never
         * trusts it. It reads `data-color` through #color and drops any raw
         * `style` attribute it doesn't alias, same as Highlight's own
         * multicolor output already does.
         */
        renderHTML: (attrs: Record<string, any>) =>
          attrs.color ? { 'data-color': attrs.color, style: `color: ${attrs.color}` } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-color]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },
});

/**
 * Renders in the editor as a bare `<details open data-title>` — no
 * <summary>, no body wrapper. Vocabulary::EXTRA_TEMPLATES['SCRIBESPOILER']
 * builds the real <summary> (from `@label`) and the `.Scribe-spoilerBody`
 * wrapper at render time, so the server owns what a spoiler looks like, not
 * the client. `open` is hardcoded so the body stays visible and editable;
 * the server's <details> has no `open` attribute, so a real spoiler stays
 * collapsed for readers as intended.
 *
 * 🚨 A <details> with no <summary> child gets the browser's own default
 * disclosure marker in the editor — cosmetic only (CSS can't reliably target
 * that phantom marker cross-browser without a real <summary> element, and an
 * empty one round-trips through the formatter as escaped literal text, since
 * s9e's HTMLElements plugin doesn't silently drop unrecognised tags — see
 * the very bug this fork was built to fix). Not worth it for a look-and-feel
 * detail; the title bar's own `::before` (forum.less) is what actually
 * communicates "this is a spoiler" in the editor.
 *
 * 🚨 parseHTML reads `.Scribe-spoilerBody` for content, not the element's
 * direct children — re-opening an existing post for editing loads the
 * SERVER-rendered HTML (summary + body div included), and without this the
 * summary's title text would get parsed in as a stray duplicate paragraph.
 */
export const ScribeSpoiler = Node.create({
  name: 'scribeSpoiler',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      label: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-title') ?? '',
        renderHTML: (attrs: Record<string, any>) =>
          attrs.label ? { 'data-title': attrs.label } : {},
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'details.Scribe-spoiler',
        contentElement: (el: HTMLElement) =>
          (el.querySelector(':scope > .Scribe-spoilerBody') as HTMLElement) ?? el,
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['details', mergeAttributes(HTMLAttributes, { class: 'Scribe-spoiler', open: 'true' }), 0];
  },
});

/**
 * Same shape as ScribeSpoiler: the editor emits a bare `<aside data-title
 * data-font data-bg data-border>`, and Vocabulary::EXTRA_TEMPLATES['INFO']
 * builds the visible title bar and `.Scribe-infoBody` wrapper at render
 * time. font/bg/border go through #color server-side exactly like
 * ScribeColor's `color` — same reasoning, see that mark above.
 */
export const ScribeInfo = Node.create({
  name: 'scribeInfo',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    const colorAttr = (key: string, source: string) => ({
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute(source),
      renderHTML: (attrs: Record<string, any>) => (attrs[key] ? { [source]: attrs[key] } : {}),
    });

    return {
      label: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-title') ?? '',
        renderHTML: (attrs: Record<string, any>) =>
          attrs.label ? { 'data-title': attrs.label } : {},
      },
      font: colorAttr('font', 'data-font'),
      bg: colorAttr('bg', 'data-bg'),
      border: colorAttr('border', 'data-border'),
    };
  },
  parseHTML() {
    return [
      {
        tag: 'aside.Scribe-info',
        contentElement: (el: HTMLElement) =>
          (el.querySelector(':scope > .Scribe-infoBody') as HTMLElement) ?? el,
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const style = [
      HTMLAttributes['data-bg'] && `background:${HTMLAttributes['data-bg']}`,
      HTMLAttributes['data-border'] && `border-color:${HTMLAttributes['data-border']}`,
      HTMLAttributes['data-font'] && `color:${HTMLAttributes['data-font']}`,
    ]
      .filter(Boolean)
      .join(';');

    return [
      'aside',
      mergeAttributes(HTMLAttributes, { class: 'Scribe-info', ...(style ? { style } : {}) }),
      0,
    ];
  },
});

/**
 * No attributes, no title — content only. Vocabulary::EXTRA_TEMPLATES
 * ['SCRIBEREPLY'] + ReplyGate::class (a Formatter render callback) decide
 * server-side whether the viewer has replied to this discussion; when they
 * haven't, the real children are never copied into the rendered XML at all.
 * A CSS-only hide would still ship the real HTML in the page source, which
 * defeats the entire point of a reply gate.
 */
export const ScribeReply = Node.create({
  name: 'scribeReply',
  group: 'block',
  content: 'block+',
  defining: true,
  parseHTML() {
    return [{ tag: 'section.Scribe-replyGate' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['section', mergeAttributes(HTMLAttributes, { class: 'Scribe-replyGate' }), 0];
  },
});

/**
 * A wrapper, not an attribute directly on `<img>`. `IMG` is a tag
 * `flarum/bbcode` claims when it's enabled (Vocabulary's own comment on
 * ELEMENTS documents this — CODE/DEL/EMAIL/IMG/LI/LIST/QUOTE/URL), so an
 * attribute added to Scribe's copy of IMG's definition never actually
 * registers: `registerTags` skips the whole tag once flarum/bbcode has
 * already claimed the name, exactly like the SPOILER/INFO tag-name
 * collision earlier this session. A `<figure>` wrapper is a tag name
 * nobody else has any reason to claim.
 */
export const ScribeImageAlign = Node.create({
  name: 'scribeImageAlign',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      align: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-align'),
        renderHTML: (attrs: Record<string, any>) =>
          attrs.align ? { 'data-align': attrs.align } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: 'figure.Scribe-imgAlign' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes, { class: 'Scribe-imgAlign' }), 0];
  },
});

/**
 * Alignment lives in `data-align` on the paragraph/heading itself, never in
 * a `style` attribute — same reasoning as ScribeColor above: a style string
 * has to be re-parsed and sanitised server-side, a bare attribute has one
 * filter (see Vocabulary::ATTRIBUTES['P']/['H2'] — #simpletext). Images go
 * through ScribeImageAlign above instead — see its own comment for why.
 */
export const ScribeAlign = Extension.create({
  name: 'scribeAlign',
  addOptions() {
    return { types: ['paragraph', 'heading'] as string[] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          align: {
            default: null,
            parseHTML: (el: HTMLElement) => el.getAttribute('data-align'),
            renderHTML: (attrs: Record<string, any>) =>
              attrs.align ? { 'data-align': attrs.align } : {},
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      /*
       * 🚨 `.map().some()`, not `.every()`. `updateAttributes(type, …)`
       * returns false when the selection isn't inside that node type — with
       * `.every()`, Array.prototype short-circuits on the FIRST false, so a
       * selection that wasn't a paragraph meant `heading` was never even
       * attempted either. Silently did nothing for anything but the first
       * type in the list.
       *
       * Images are a separate case: not an attribute in `types` above, but
       * a wrap/update on the `scribeImageAlign` figure — see
       * ScribeImageAlign's own comment for why `<img>` can't carry this
       * attribute directly.
       */
      setAlign:
        (align: string) =>
        ({ commands }: any) => {
          const onTextBlock = this.options.types
            .map((type: string) => commands.updateAttributes(type, { align }))
            .some(Boolean);
          if (onTextBlock) return true;

          return (
            commands.updateAttributes('scribeImageAlign', { align }) ||
            commands.wrapIn('scribeImageAlign', { align })
          );
        },
    } as any;
  },
});

export function buildExtensions(placeholder: string) {
  return [
    Document,
    Paragraph,
    Text,
    Bold,
    Italic,
    Strike,
    Underline,
    Superscript,
    Subscript,
    Code,
    CodeBlock,
    // The server has templates for all six (Vocabulary::TEMPLATES); only
    // 1-4 are exposed in the toolbar — 5/6 are visually indistinguishable
    // from body text and from each other at typical post-body font sizes.
    Heading.configure({ levels: [1, 2, 3, 4] }),
    BulletList,
    /*
     * 🚨 `data-type` is not decoration. Both <ul> and <ol> alias to the single
     * LIST tag server-side, and the template picks <ul> vs <ol> purely on
     * whether @type is present — so an ordered list that omits this silently
     * renders as a bulleted one.
     */
    OrderedList.extend({
      renderHTML({ HTMLAttributes }) {
        return ['ol', mergeAttributes(HTMLAttributes, { 'data-type': 'decimal' }), 0];
      },
    }),
    ListItem,
    Blockquote,
    HardBreak,
    HorizontalRule,
    Link.configure({ openOnClick: false, autolink: true }),
    /*
     * 🚨 `resize` is TipTap's own built-in — the corner-drag handles, the
     * live nodeView while dragging, committing `width`/`height` onto the
     * node on release, all of it. Nothing custom needed client-side; the
     * only thing Scribe adds is the server side reading those two
     * attributes back out (Vocabulary::ATTRIBUTES['IMG']).
     */
    Image.configure({ resize: { enabled: true, minWidth: 40, minHeight: 40 } }),
    Highlight.configure({ multicolor: true }),
    History,
    Dropcursor,
    Gapcursor,
    TextStyle,
    ScribeColor,
    ScribeAlign,
    ScribeImageAlign,
    ScribeSpoiler,
    ScribeInfo,
    ScribeReply,
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({ placeholder }),
    /*
     * Nodes, marks and behaviours registered by other extensions, built here
     * rather than at registration time so they get TipTap without depending on
     * it — see common/registry.ts for why that matters.
     *
     * 🚨 Last in the array on purpose. TipTap resolves conflicting keyboard
     * shortcuts and input rules in favour of the LAST extension that claims
     * them, so a third party can deliberately override a built-in. It also
     * means a careless one can take Enter away from paragraphs, which is worth
     * knowing when a forum reports the editor "stopped working" after
     * installing something.
     */
    ...registeredExtensions().map((factory) => factory({ Node, Mark, Extension, mergeAttributes })),
  ];
}
