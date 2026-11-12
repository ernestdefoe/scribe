import type Mithril from 'mithril';
import type { Editor } from '@tiptap/core';
import ScribeToolbar from './components/ScribeToolbar';
import { allButtons, configuredToolbar } from './toolbarButtons';
import type EditorDriverInterface from 'flarum/common/utils/EditorDriverInterface';
import type { EditorDriverParams } from 'flarum/common/utils/EditorDriverInterface';

// `m` is a global provided by Flarum. Importing the package instead would bundle
// a second copy of Mithril, and the two would not share a redraw queue.
declare const m: Mithril.Static;

/**
 * Bridges TipTap to the contract Flarum's composer expects.
 *
 * 🚨 The contract is expressed in integer positions — getSelectionRange returns
 * numbers, insertBetween takes them. Those are ProseMirror document positions,
 * NOT character offsets into a string. That is safe precisely because every
 * position Flarum hands back came from this driver in the first place (mention
 * autocomplete reads getSelectionRange, then calls insertBetween with what it
 * read), so both sides share one coordinate system. Converting to character
 * offsets would be the bug: a ProseMirror position counts node boundaries, so
 * the two drift apart the moment a post contains a list.
 *
 * 🚨 The editor is loaded asynchronously, so `editor` is undefined for the first
 * few frames. Core calls buildEditor() synchronously and expects a driver back
 * immediately, so every method here has to be safe before the editor exists.
 */
export default class ScribeEditorDriver implements EditorDriverInterface {
  editor?: Editor;
  el: HTMLElement;
  toolbarEl: HTMLElement;

  private params: EditorDriverParams;
  private ready: Promise<void>;
  /** legacyInsert's translator, from the editor chunk once it has loaded. */
  private toEditorContent: (text: string) => string | null = () => null;
  private destroyed = false;
  /** Which buttons are lit. The toolbar only redraws when this changes. */
  private activeSignature = '';

  constructor(dom: HTMLElement, params: EditorDriverParams) {
    this.params = params;

    this.toolbarEl = document.createElement('div');
    this.toolbarEl.className = 'Scribe-toolbarMount';
    dom.append(this.toolbarEl);

    this.el = document.createElement('div');
    this.el.classList.add('Scribe-editor', ...params.classNames);
    dom.append(this.el);

    /*
     * 🚨 Make the element answer to `.value`, like the textarea it replaces.
     *
     * Core's own driver puts a <textarea> on `driver.el`, so `composer.editor.el.value`
     * became a de-facto contract long before this extension existed. Extensions
     * read it directly — MagicRead's character counter does exactly
     * `ctx.attrs.composer.editor.el` and then `ta.value.length`, casting to
     * HTMLTextAreaElement without checking. Against a <div> that is `undefined`,
     * so `.length` throws on EVERY keystroke: a user reported thousands of
     * console errors and a composer that had to be seen to be believed.
     *
     * We cannot fix every extension that assumes this, and we are the ones who
     * changed the element out from under them, so the element answers to `.value`
     * instead. Defined on the instance rather than the prototype because the
     * element is a plain div shared with everything else on the page.
     *
     * 🚨 The value is the PLAIN TEXT, not getHTML().
     *
     * Every realistic consumer of this is counting or validating what the
     * person wrote: a character counter, a minimum-length check. Handing them
     * markup makes a counter read 7 on an empty composer (`<p></p>`) and 12
     * for "hello", and it makes a ten-character minimum pass on a one-character
     * post. Plain text is what those callers mean by "the value", and it is
     * what a Markdown textarea would have given them for unformatted prose.
     *
     * Scribe never reads this itself — the real content goes through
     * getHTML() in oninput — so nothing internal depends on it round-tripping
     * formatting.
     */
    Object.defineProperty(this.el, 'value', {
      configurable: true,
      get: () => (this.editor ? this.editor.getText() : this.params.value || ''),
      set: (next: unknown) => {
        const text = next == null ? '' : String(next);
        if (this.editor) this.editor.commands.setContent(text);
        else this.params.value = text;
      },
    });

    /*
     * 🚨 Make the element take focus, like the textarea it replaces.
     *
     * Core's Composer.focus() runs `$('.TextEditor-editor').focus()` when the
     * composer opens. That class sits on this wrapper div, not on the editable
     * ProseMirror element inside it, and a plain div ignores focus() — so
     * clicking Reply left the caret nowhere and the person had to click into
     * the editor before typing. Forward it to the editor instead.
     */
    this.el.focus = () => this.focus();

    this.renderToolbar();
    this.ready = this.boot();
  }

  private async boot(): Promise<void> {
    /*
     * 🚨 The path decides the URL. Flarum publishes a declared jsDirectory to
     * assets/js/<ext>/<frontend>/…, rewriting the directory's own name to the
     * frontend's — while webpack names the chunk after its path under src/.
     * The two only agree if the module lives under src/forum, and when they
     * disagree the chunk 404s and the composer silently renders empty.
     */
    // The paste and Markdown-insert helpers ride in the same chunk: only a composer needs them.
    const {
      wordNotesToSuperscript,
      createEditor,
      cleanTableHtml,
      hasTable,
      tsvRows,
      tsvToTableHtml,
      cleanPastedHtml,
      isEditorHtml,
      embeddedImages,
      looksLikeMarkdown,
      markdownToHtml,
      isStyledPlainText,
      toEditorContent,
      toEditorSource,
    } = await import('../forum/tiptap/boot');
    this.toEditorContent = toEditorContent;

    const original = this.params.value || '';
    const converted = toEditorSource(original);
    const legacySource = converted !== original;

    // The composer can be closed while the chunk is still in flight.
    if (this.destroyed) return;

    this.editor = createEditor({
      element: this.el,
      placeholder: this.params.placeholder,
      // A post written before Scribe stores Markdown, not HTML; see legacySource.
      content: converted,
      editable: !this.params.disabled,
      onUpdate: () => {
        // Serialise on change only. getHTML() walks the whole document, so
        // calling it from the input listeners as well makes every keypress
        // cost O(document).
        this.params.oninput(this.editor!.getHTML());

        /*
         * 🚨 Fire a native `input` event, because a textarea would have.
         *
         * The element this replaces is a <textarea>, so extensions bind
         * `editor.el.addEventListener('input', …)` and expect to hear about
         * every keystroke — MagicRead's character counter does exactly that.
         * ProseMirror owns this DOM and does not reliably emit `input` for
         * content it applies itself, so a counter bound here would mount, read
         * once, and then never move again. Emitting it ourselves keeps that
         * side of the contract too.
         */
        this.el.dispatchEvent(new Event('input', { bubbles: true }));
      },
      onTransaction: () => {
        /*
         * 🚨 One bad listener must not take the editor down with it.
         *
         * These callbacks belong to other extensions, and they run on every
         * transaction. Calling them bare meant a single throwing listener
         * aborted the loop, skipped syncToolbar() so the toolbar froze, and
         * propagated out through ProseMirror's transaction handling — turning
         * one extension's wrong assumption into an editor that appeared
         * completely broken. Isolate each one; a listener that throws is that
         * extension's bug, reported once and then stepped over.
         */
        this.params.inputListeners.forEach((l: Function) => {
          try {
            l();
          } catch (e) {
            console.error('[Scribe] an input listener from another extension threw:', e);
          }
        });

        this.syncToolbar();
      },
      editorProps: {
        handleKeyDown: (_view: unknown, event: KeyboardEvent) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            this.params.onsubmit();
            return true;
          }
          return false;
        },

        /*
         * 🚨 PASTING AN IMAGE PRODUCED TWO OF THEM.
         *
         * The clipboard carries an image in several forms at once: the file
         * itself, and an HTML fragment pointing at wherever it came from. FoF
         * Upload's listener takes the FILE, uploads it, and inserts the result
         * when it finishes — while ProseMirror, meanwhile, has already pasted
         * the HTML fragment. The poster gets the uploaded image and a second
         * one hotlinked from a source that may well be private or expire.
         * Reported by tennyy on Flarum 2.0.0-rc.8.
         *
         * Returning true here says "handled": ProseMirror inserts nothing and
         * the upload arrives on its own a moment later, which is the behaviour
         * everybody expects and the one the plain textarea always had.
         *
         * 🚨 Only when there is an uploader to hand it to. Swallowing the paste
         * on a forum without FoF Upload would mean pasting an image does
         * NOTHING — a worse bug than the one being fixed, and one that would
         * look like Scribe ignoring the clipboard entirely.
         */
        handlePaste: (view: any, event: ClipboardEvent) => {
          const data = event.clipboardData;
          if (!data) return false;

          const image = hasImageFile(event);

          /*
           * 🚨 A SPREADSHEET'S CELLS ARE A TABLE, NOT A PICTURE.
           *
           * Excel, Google Sheets, LibreOffice Calc and Numbers put a bitmap of
           * the copied cells on the clipboard beside the table itself, and FoF
           * Upload's listener uploaded it: Wil Vincent's AP Poll went up as
           * `image.png` (2026-10-19). FoF Upload listens on this.el, which
           * ProseMirror's own listener sits inside, so stopping the event here
           * is the only way it never hears of the paste — with or without FoF
           * Upload installed, the table goes in.
           */
          const html = data.getData('text/html');

          // A picture that came only inside the HTML is uploaded like any other; see pastedImages.
          if (!image && html && anUploaderIsInstalled()) {
            const files = embeddedImages(new DOMParser().parseFromString(html, 'text/html'));
            if (files.length) {
              this.uploadFiles(files);
              return true;
            }
          }

          if (hasTable(html)) {
            if (image) event.stopPropagation();
            return false; // ProseMirror parses the HTML; transformPastedHTML cleans it.
          }

          // Plain text, unless it is going into a code block or pasted as plain text.
          const text = data.getData('text/plain');
          const asText = !view.input?.shiftKey && view.state.selection.$from.parent.type.name !== 'codeBlock';

          /*
           * 🚨 Ctrl/⌘+Shift+V means "exactly the characters I copied". The
           * browser hands over plain text, but TipTap's paste rules still turned
           * `**x**` bold and `~~x~~` struck through on the way in. Inserted as
           * content instead of pasted, they never run: one paragraph per line,
           * as ProseMirror's own plain paste does.
           */
          if (view.input?.shiftKey && text && !image && view.state.selection.$from.parent.type.name !== 'codeBlock') {
            const lines = text.replace(/\r\n?/g, '\n').split(/\n+/);
            const content =
              lines.length === 1
                ? { type: 'text', text: lines[0] }
                : lines.map((line: string) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] }));
            this.editor!.chain().focus().insertContent(content).run();
            return true;
          }

          // Tab-separated text with no HTML (Numbers, a text editor) is a grid too.
          const rows = !html && asText ? tsvRows(text) : null;
          if (rows) {
            if (image) event.stopPropagation();
            view.pasteHTML(tsvToTableHtml(rows));
            return true;
          }

          /*
           * Markdown copied as text (a README, a chatbot's answer) becomes
           * formatting. Real formatting on the clipboard wins; a code editor's
           * coloured copy of a Markdown file is still text (isStyledPlainText).
           */
          if (asText && !image && (!html || isStyledPlainText(html)) && looksLikeMarkdown(text)) {
            view.pasteHTML(markdownToHtml(text));
            return true;
          }

          return image && anUploaderIsInstalled();
        },

        /*
         * Word's `[i]` note marks would open a BBCode italic; see wordNotes.
         * Word, Google Docs and web pages arrive full of styling Scribe cannot
         * store; see pasteClean. Office tables get their own pass; see
         * spreadsheetPaste. A copy out of this editor is already clean.
         */
        transformPastedHTML: (html: string) => {
          if (isEditorHtml(html)) return html;
          html = wordNotesToSuperscript(html);
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const toolbar = configuredToolbar();
          cleanPastedHtml(doc, { color: toolbar.includes('color'), highlight: toolbar.includes('highlight') });
          return hasTable(html) ? cleanTableHtml(html, doc) : doc.body.innerHTML;
        },
      },
    } as any);

    if (legacySource) this.adoptConvertedSource(original);

    this.renderToolbar();
  }

  /**
   * An old post's Markdown, now loaded as formatting, becomes the composer's
   * content straight away rather than at the first keystroke.
   *
   * 🚨 Until then the composer still held the Markdown, and Flarum's live
   * preview of the post being edited showed it as `**this**` beside an editor
   * showing bold. It also becomes the composer's ORIGINAL content, so closing
   * an edit nobody changed does not ask about unsaved changes.
   */
  private adoptConvertedSource(original: string): void {
    const html = this.editor!.getHTML();
    this.params.oninput(html);
    /*
     * EditPostComposer fills `originalContent` from the post on its own copy
     * of the attributes, which Flarum rebuilds from the composer state on every
     * redraw and only defaults when unset — so set it on the state, then redraw.
     */
    const body = (globalThis as any).app?.composer?.body;
    const before = body?.attrs?.originalContent ?? body?.attrs?.post?.content?.();
    if (body?.attrs && before === original) {
      body.attrs.originalContent = html;
      m.redraw();
    }
  }

  /**
   * Hands files to the uploader as a drop of them.
   *
   * FoF Upload keeps its uploader to itself and listens for files dropped on
   * the composer, so a drop carrying only the files is the way in. It starts
   * at this element, not at ProseMirror's inside it, so the editor never sees
   * it.
   *
   * 🚨 A drop, not a paste: Firefox empties the clipboardData of a paste event
   * made in script, so the uploader got no files there.
   */
  private uploadFiles(files: File[]): void {
    const data = new DataTransfer();
    files.forEach((file) => data.items.add(file));
    this.el.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
  }

  /**
   * 🚨 m.render, NOT m.mount.
   *
   * Flarum replaces m.redraw with its own batched version that only redraws
   * Flarum's own root, so a separately *mounted* root is simply never redrawn
   * again — the toolbar renders once while the editor is still loading, comes
   * back empty, and stays empty forever. Only m.redraw.sync() reaches it, and
   * that forces a synchronous redraw of the entire application.
   *
   * m.render draws this element and nothing else, when we say so. The toolbar
   * is driven by editor transactions rather than by Flarum's redraw cycle, so
   * it does not need to be in that cycle at all.
   */
  private renderToolbar(): void {
    if (this.destroyed) return;
    m.render(this.toolbarEl, m(ScribeToolbar, { editor: this.editor, onChange: () => this.renderToolbar() }));
  }

  /**
   * 🚨 Redraw only when the set of active buttons actually changed.
   *
   * ProseMirror fires a transaction for every keystroke, and a naive
   * `m.redraw()` here re-renders every button on every character typed — the
   * cost that makes a rich editor feel heavy on a long post. Typing inside a
   * paragraph changes nothing about which buttons are lit, so the common case
   * does no work at all.
   */
  private syncToolbar(): void {
    if (!this.editor) return;
    let signature = '';
    for (const b of allButtons()) {
      if (b.active?.(this.editor)) signature += b.key + ',';
    }
    if (signature !== this.activeSignature) {
      this.activeSignature = signature;
      this.renderToolbar();
    }
  }

  moveCursorTo(position: number): void {
    this.ready.then(() => this.editor?.commands.focus(position));
  }

  getSelectionRange(): Array<number> {
    if (!this.editor) return [0, 0];
    const { from, to } = this.editor.state.selection;
    return [from, to];
  }

  /**
   * The last N characters of the current text block, which is what mention
   * autocomplete watches. Scoped to the block rather than the document so a
   * trigger character cannot be picked up from the paragraph above.
   */
  getLastNChars(n: number): string {
    if (!this.editor) return '';
    const { state } = this.editor;
    const { $from, from } = state.selection as any;
    const text = state.doc.textBetween($from.start(), from, '\n', '\n');
    return text.slice(Math.max(0, text.length - n));
  }

  insertAtCursor(text: string, escape: boolean = true): void {
    this.insertAt(this.getSelectionRange()[0], text, escape);
  }

  insertAt(pos: number, text: string, escape: boolean = true): void {
    this.insertBetween(pos, pos, text, escape);
  }

  insertBetween(start: number, end: number, text: string, _escape: boolean = true): void {
    this.ready.then(() => {
      if (!this.editor) return;
      const chain = this.editor.chain().focus();
      if (start !== end) chain.deleteRange({ from: start, to: end });
      // Other extensions still speak Markdown through this interface — quoting
      // a post and finishing an upload both arrive here as Markdown.
      chain.insertContentAt(start, this.toEditorContent(text) ?? text).run();
    });
  }

  replaceBeforeCursor(start: number, text: string, escape: boolean = true): void {
    this.insertBetween(start, this.getSelectionRange()[0], text, escape);
  }

  getCaretCoordinates(position: number): { left: number; top: number } {
    if (!this.editor) return { left: 0, top: 0 };
    const coords = this.editor.view.coordsAtPos(position);
    const box = this.el.getBoundingClientRect();
    return { left: coords.left - box.left, top: coords.top - box.top };
  }

  disabled(disabled: boolean): void {
    this.params.disabled = disabled;
    this.ready.then(() => this.editor?.setEditable(!disabled));
  }

  focus(): void {
    this.ready.then(() => this.editor?.commands.focus());
  }

  destroy(): void {
    this.destroyed = true;
    // Tear the toolbar down before the editor: its view reads this.editor, and
    // a render scheduled after destroy() would touch a torn-down instance.
    m.render(this.toolbarEl, []);
    this.editor?.destroy();
    this.toolbarEl.remove();
    this.el.remove();
  }
}

/**
 * Whether the clipboard carries an actual image FILE, as opposed to a copied
 * <img> element or text that merely mentions one.
 *
 * 🚨 `kind === 'file'` rather than a type check alone. Copying an image inside
 * a web page puts `image/png` on the clipboard as HTML, not as a file — and
 * swallowing that would break the ordinary act of copying an image from one
 * post into another, which no uploader handles because there is nothing to
 * upload.
 */
function hasImageFile(event: ClipboardEvent): boolean {
  const items = event.clipboardData?.items;

  if (!items) return false;

  for (let i = 0; i < items.length; i++) {
    if (items[i].kind === 'file' && items[i].type.startsWith('image/')) return true;
  }

  return false;
}

/**
 * Whether something is listening for pasted files.
 *
 * 🚨 Resolved at RUNTIME through Flarum's own registry, never imported. Scribe
 * must build and run identically whether or not FoF Upload is installed, and
 * an import of a package that is not there takes the whole forum's JS bundle
 * down with it.
 */
function anUploaderIsInstalled(): boolean {
  const extensions = (globalThis as any)?.flarum?.extensions;

  if (!extensions) return false;

  return 'fof-upload' in extensions;
}
