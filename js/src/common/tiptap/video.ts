import app from 'flarum/common/app';
import extractText from 'flarum/common/utils/extractText';
import { Extension, Node, mergeAttributes, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, NodeSelection } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { VIDEO_PROVIDERS, isValidVideo, thumbnailUrl, videoBrand, videoFromUrl, videoRatioClass } from '../video/providers';
import { insertVideo } from '../video/insert';

/**
 * A video embed: provider + id (+ start, + caption), never a URL.
 *
 * Stored as `<video data-provider data-id data-start>caption</video>`,
 * which the server aliases onto SCRIBEVIDEO (src/Formatter/VideoEmbed.php) and
 * checks against the provider's own id pattern. `<video>` because s9e will not
 * alias a hyphenated custom element, `figure` is already the image-align
 * wrapper and `embed` is Ruffle's.
 *
 * Re-opening a post for editing can hand back either that stored form or the
 * rendered facade, so both are parsed — and both are validated here too, so a
 * malformed one is dropped by the editor rather than round-tripped.
 */
export const ScribeVideo = Node.create({
  name: 'scribeVideo',
  group: 'block',
  /*
   * The caption is the node's CONTENT — plain text, no marks — not an
   * attribute. In an attribute it sat inside the stored start tag, where
   * Flarum's Autolink, HTMLEntities and emoji plugins could each reach in and
   * tear the tag apart (see VideoEmbed.php).
   */
  content: 'text*',
  marks: '',
  defining: true,
  isolating: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      provider: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-provider'),
        renderHTML: (a: Record<string, any>) => ({ 'data-provider': a.provider }),
      },
      id: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-id'),
        renderHTML: (a: Record<string, any>) => ({ 'data-id': a.id }),
      },
      start: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const n = parseInt(el.getAttribute('data-start') || '', 10);
          return n > 0 ? n : null;
        },
        renderHTML: (a: Record<string, any>) => (a.start > 0 ? { 'data-start': String(a.start) } : {}),
      },
    };
  },

  parseHTML() {
    const valid = (el: HTMLElement) => (isValidVideo(el.getAttribute('data-provider') || '', el.getAttribute('data-id')) ? null : false);

    return [
      { tag: 'video[data-provider]', getAttrs: valid },
      {
        // The rendered facade: the caption is the one part of it that is content.
        tag: 'figure.Scribe-video[data-provider]',
        getAttrs: valid,
        contentElement: (el: HTMLElement) => (el.querySelector('.Scribe-videoCaption') as HTMLElement) ?? document.createElement('span'),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['video', mergeAttributes(HTMLAttributes), 0];
  },

  addKeyboardShortcuts() {
    return {
      // Enter in a caption leaves it for the paragraph after the video,
      // making one if there is none: a caption is one line.
      Enter: ({ editor }) => {
        const { $from } = editor.state.selection;
        if ($from.parent.type.name !== this.name) return false;
        const after = $from.after();
        const next = editor.state.doc.resolve(after).nodeAfter;
        if (next && next.type.name === 'paragraph')
          return editor
            .chain()
            .focus(after + 1)
            .run();
        return editor
          .chain()
          .insertContentAt(after, { type: 'paragraph' })
          .focus(after + 1)
          .run();
      },
    };
  },

  addStorage() {
    // The toolbar registers its video form here, so the node's own "Replace"
    // button can open it — the same hand-off Ctrl+K uses for links.
    return { open: null as null | (() => void) };
  },

  addNodeView() {
    return (props: any) => new VideoNodeView(props.node, props.editor, props.getPos);
  },
});

/**
 * Auto-embed: a supported link pasted on its own line becomes a video.
 *
 * "On its own" means the paste is nothing but the URL AND it lands in an empty
 * paragraph with nothing selected. A URL pasted into a sentence is somebody
 * citing a link, and stays a link; so does one pasted over selected text.
 *
 * 🚨 Its own extension, at a priority above Link's (1000). ProseMirror asks
 * plugins in priority order and the first to handle a paste wins; at the
 * default priority Link's own paste handling turned the URL into a link before
 * this was ever asked.
 */
export const ScribeVideoPaste = Extension.create({
  name: 'scribeVideoPaste',
  priority: 1100,

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: new PluginKey('scribeVideoPaste'),
        props: {
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData('text/plain')?.trim();
            if (!text) return false;

            const { selection } = view.state;
            if (!selection.empty) return false;

            const { $from } = selection;
            if ($from.parent.type.name !== 'paragraph' || $from.parent.content.size !== 0) return false;

            const ref = videoFromUrl(text);
            if (!ref) return false;

            return insertVideo(editor, ref, { from: $from.before(), to: $from.after() });
          },
        },
      }),
    ];
  },
});

function t(key: string, params?: Record<string, string>): string {
  return extractText(app.translator.trans(`ernestdefoe-scribe.forum.video.${key}`, params as any));
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

/**
 * What the video looks like while writing: the same facade readers get, minus
 * the player. Nothing autoplays and nothing is fetched from the provider except
 * a thumbnail where the provider has one.
 *
 * The caption line is the node's content (ProseMirror edits it directly); the
 * rest is decoration, marked non-editable. Built with DOM calls, never
 * innerHTML.
 */
class VideoNodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private figure: HTMLElement;
  private visual: HTMLElement;
  private watch: HTMLElement;
  private rendered = '';

  constructor(
    private node: PMNode,
    private editor: Editor,
    private getPos: () => number | undefined
  ) {
    this.dom = el('div', 'Scribe-videoNode');

    this.figure = el('figure', 'Scribe-video');
    this.visual = el('div', 'Scribe-videoFacade');
    this.visual.contentEditable = 'false';

    const tools = el('div', 'Scribe-videoNodeTools');
    tools.contentEditable = 'false';
    tools.append(
      this.tool('fas fa-arrows-rotate', t('replace'), () => this.replace()),
      this.tool('fas fa-trash-can', t('remove'), () => this.remove())
    );

    const bar = el('figcaption', 'Scribe-videoBar');
    this.contentDOM = el('span', 'Scribe-videoCaption Scribe-videoCaptionEdit');
    this.contentDOM.setAttribute('data-placeholder', t('caption_placeholder'));
    this.contentDOM.setAttribute('aria-label', t('caption_label'));
    this.watch = el('span', 'Scribe-videoWatch');
    this.watch.contentEditable = 'false';
    bar.append(this.contentDOM, this.watch);

    this.figure.append(this.visual, tools, bar);
    this.dom.append(this.figure);
    this.draw();
  }

  private tool(icon: string, label: string, run: () => void): HTMLButtonElement {
    const b = el('button', 'Button Button--icon Scribe-videoTool');
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    const i = el('i', `icon ${icon}`);
    i.setAttribute('aria-hidden', 'true');
    b.append(i);
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      e.preventDefault();
      run();
    });
    return b;
  }

  private draw() {
    const { provider, id, start } = this.node.attrs;
    const key = `${provider}:${id}`;

    this.contentDOM.classList.toggle('is-empty', this.node.content.size === 0);

    if (key === this.rendered) return;
    this.rendered = key;

    const brand = videoBrand(provider);
    const icon = VIDEO_PROVIDERS[provider]?.icon ?? 'fas fa-video';
    this.figure.className = `Scribe-video ${videoRatioClass(provider)}`;
    this.figure.dataset.provider = provider;

    this.visual.replaceChildren();
    const thumb = thumbnailUrl({ provider, id, start });
    if (thumb) {
      const img = el('img', 'Scribe-videoThumb');
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.src = thumb;
      img.draggable = false;
      this.visual.append(img);
    } else {
      const poster = el('span', 'Scribe-videoPoster');
      const i = el('i', `icon ${icon}`);
      i.setAttribute('aria-hidden', 'true');
      const name = el('span', 'Scribe-videoBrand');
      name.textContent = brand;
      poster.append(i, name);
      this.visual.append(poster);
    }
    const play = el('span', 'Scribe-videoPlay');
    play.setAttribute('aria-hidden', 'true');
    this.visual.append(play);

    this.watch.replaceChildren();
    const wi = el('i', `icon ${icon}`);
    wi.setAttribute('aria-hidden', 'true');
    this.watch.append(wi, document.createTextNode(' ' + t('watch_on', { provider: brand })));
  }

  private select() {
    const pos = this.getPos();
    if (typeof pos !== 'number') return;
    this.editor.view.dispatch(this.editor.state.tr.setSelection(NodeSelection.create(this.editor.state.doc, pos)));
  }

  private replace() {
    this.select();
    const open = (this.editor.storage as any).scribeVideo?.open;
    if (typeof open === 'function') open();
  }

  private remove() {
    const pos = this.getPos();
    if (typeof pos !== 'number') return;
    this.editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + this.node.nodeSize })
      .run();
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.draw();
    return true;
  }

  /** The buttons are ours; typing, selecting and dragging are ProseMirror's. */
  stopEvent(event: Event) {
    const target = event.target as HTMLElement | null;
    return !!target && !!target.closest('button');
  }

  /** Only changes inside the caption are content; the rest is drawn by us. */
  ignoreMutation(mutation: { type: string; target: globalThis.Node }) {
    if (mutation.type === 'selection') return false;
    return !this.contentDOM.contains(mutation.target);
  }
}
