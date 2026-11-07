import app from 'flarum/common/app';
import extractText from 'flarum/common/utils/extractText';
import type Mithril from 'mithril';
import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { buttonsFor, configuredToolbar, type ScribeButton } from '../toolbarButtons';
import { available, buttonLabel } from '../components/ScribeToolbar';
import { filterSlashItems, slashQuery } from '../slashQuery';

declare const m: Mithril.Static;

interface SlashItem {
  key: string;
  label: string;
  button: ScribeButton;
}

/** Buttons that make no sense picked from a menu at the cursor. */
const NOT_OFFERED = ['undo', 'redo'];

/**
 * The `/` menu: type `/` at the start of a line or after a space and the
 * toolbar's own features drop down, filtered as you type. Arrow keys and Enter
 * (or Tab) pick one, Escape closes it, and it works by touch.
 *
 * It offers exactly what the toolbar does, in the toolbar's order, so an
 * admin who takes a feature out of the toolbar takes it out of here too.
 * Picking one deletes the `/query` and then does what the button does; a
 * button that opens a form (link, table size, spoiler title…) opens that
 * form in the toolbar, through the opener the toolbar registers here.
 *
 * 🚨 The menu lives on <body>, fixed, not inside the composer: the composer
 * clips its own overflow, and on a phone the menu has to sit in the part of
 * the screen the keyboard leaves (window.visualViewport), above the line
 * when there is no room below it.
 */
export const ScribeSlashMenu = Extension.create({
  name: 'scribeSlash',

  addStorage() {
    return { openPrompt: null as null | ((kind: NonNullable<ScribeButton['prompt']>) => void) };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const storage = this.storage as { openPrompt: null | ((kind: any) => void) };
    let menu: SlashMenu | null = null;

    return [
      new Plugin({
        key: new PluginKey('scribeSlash'),
        view: (view) => (menu = new SlashMenu(editor, view, storage)),
        props: {
          handleKeyDown: (_view, event) => menu?.onKey(event) ?? false,
        },
      }),
    ];
  },
});

class SlashMenu {
  private el: HTMLElement | null = null;
  private items: SlashItem[] = [];
  private index = 0;
  /** The `/query` range the menu is for. */
  private from = 0;
  private to = 0;
  /** Escape closes the menu for the `/` at this position until it is gone. */
  private dismissed = -1;
  private blurTimer = 0;
  private readonly id = `Scribe-slash-${Math.random().toString(36).slice(2, 8)}`;
  private readonly reposition = () => this.place();
  private readonly onBlur = () => {
    clearTimeout(this.blurTimer);
    // A tap on the menu itself can blur first on a touch screen.
    this.blurTimer = window.setTimeout(() => this.editor.isFocused || this.hide(), 200);
  };

  constructor(
    private editor: Editor,
    private view: EditorView,
    private storage: { openPrompt: null | ((kind: any) => void) }
  ) {
    editor.on('blur', this.onBlur);
  }

  update(view: EditorView): void {
    this.view = view;
    const found = this.find();

    if (!found) return this.hide();

    const { items, from, to } = found;
    if (from !== this.from || items.length !== this.items.length || items.some((item, i) => item.key !== this.items[i]?.key)) this.index = 0;
    this.items = items;
    this.from = from;
    this.to = to;
    this.render();
  }

  private find(): { items: SlashItem[]; from: number; to: number } | null {
    if (app.forum.attribute('scribeSlashMenu') === false || !this.editor.isEditable) return null;

    const { selection } = this.view.state;
    if (!selection.empty) return null;

    const { $from } = selection;
    if (!$from.parent.isTextblock || $from.parent.type.spec.code || $from.marks().some((mark) => mark.type.spec.code)) return null;

    const query = slashQuery($from.parent.textBetween(0, $from.parentOffset, undefined, '￼'));
    if (!query) return null;

    const from = $from.pos - query.length;
    if (from === this.dismissed) return null;
    this.dismissed = -1;

    const all = buttonsFor(configuredToolbar())
      .filter((b) => available(b) && !NOT_OFFERED.includes(b.key))
      // trans() hands back vnodes, not a string; the filter needs the text.
      .map((button) => ({ key: button.key, label: extractText(buttonLabel(button)), button }));
    const items = filterSlashItems(all, query.query);

    return items.length ? { items, from, to: $from.pos } : null;
  }

  onKey(event: KeyboardEvent): boolean {
    if (!this.el || event.isComposing) return false;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.index = (this.index + step + this.items.length) % this.items.length;
      this.render();
      return true;
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      this.pick(this.items[this.index]);
      return true;
    }

    if (event.key === 'Escape') {
      this.dismissed = this.from;
      this.hide();
      return true;
    }

    return false;
  }

  private pick(item: SlashItem | undefined): void {
    if (!item) return;
    const { button } = item;

    this.hide();
    this.editor.chain().focus().deleteRange({ from: this.from, to: this.to }).run();

    if (button.prompt) {
      // The table button opens a menu of row and column actions; from here
      // the person wants a new table, so go straight to its size.
      this.storage.openPrompt?.(button.prompt === 'tableMenu' ? 'table' : button.prompt);
    } else {
      button.run?.(this.editor);
    }
  }

  private render(): void {
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.className = 'Scribe-slashMenu';
      this.el.id = this.id;
      this.el.setAttribute('role', 'listbox');
      this.el.setAttribute('aria-label', extractText(app.translator.trans('ernestdefoe-scribe.forum.slash.label')));
      document.body.appendChild(this.el);
      window.addEventListener('resize', this.reposition);
      window.addEventListener('scroll', this.reposition, true);
      window.visualViewport?.addEventListener('resize', this.reposition);
      window.visualViewport?.addEventListener('scroll', this.reposition);
    }

    this.el.dir = getComputedStyle(this.view.dom).direction;
    this.view.dom.setAttribute('aria-expanded', 'true');
    this.view.dom.setAttribute('aria-controls', this.id);
    this.view.dom.setAttribute('aria-activedescendant', `${this.id}-${this.index}`);

    m.render(
      this.el,
      this.items.map((item, i) => (
        <div
          key={item.key}
          id={`${this.id}-${i}`}
          className={'Scribe-slashItem' + (i === this.index ? ' is-active' : '')}
          role="option"
          aria-selected={i === this.index ? 'true' : 'false'}
          // Keep the caret in the editor: the menu never takes focus.
          onmousedown={(e: MouseEvent) => {
            e.preventDefault();
          }}
          onmousemove={() => {
            if (this.index === i) return;
            this.index = i;
            this.render();
          }}
          onclick={() => this.pick(item)}
        >
          <i className={'icon ' + item.button.icon} aria-hidden="true" data-badge={item.button.badge} />
          <span className="Scribe-slashLabel">{item.label}</span>
        </div>
      ))
    );

    this.place();
    this.el.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }

  /**
   * Under the line when it fits in what the keyboard leaves of the screen,
   * above it otherwise; lined up with the `/`, from the right in a
   * right-to-left language.
   */
  private place(): void {
    if (!this.el) return;

    let caret: { top: number; bottom: number; left: number; right: number };
    try {
      caret = this.view.coordsAtPos(this.from);
    } catch (e) {
      return this.hide();
    }

    const vv = window.visualViewport;
    const top = vv ? vv.offsetTop : 0;
    const left = vv ? vv.offsetLeft : 0;
    const width = vv ? vv.width : window.innerWidth;
    const height = vv ? vv.height : window.innerHeight;
    const gap = 6;

    const below = top + height - caret.bottom - gap * 2;
    const above = caret.top - top - gap * 2;
    const style = this.el.style;
    const natural = Math.min(this.el.scrollHeight, 280);
    const downward = below >= natural || below >= above;

    style.maxHeight = `${Math.max(96, Math.min(280, downward ? below : above))}px`;
    const menuHeight = Math.min(this.el.scrollHeight, parseFloat(style.maxHeight));
    style.top = `${downward ? caret.bottom + gap : caret.top - gap - menuHeight}px`;

    const menuWidth = this.el.offsetWidth;
    const rtl = this.el.dir === 'rtl';
    const x = rtl ? caret.right - menuWidth : caret.left;
    style.left = `${Math.max(left + 8, Math.min(x, left + width - menuWidth - 8))}px`;
  }

  hide(): void {
    if (!this.el) return;
    m.render(this.el, []);
    this.el.remove();
    this.el = null;
    this.items = [];
    this.view.dom.removeAttribute('aria-expanded');
    this.view.dom.removeAttribute('aria-controls');
    this.view.dom.removeAttribute('aria-activedescendant');
    window.removeEventListener('resize', this.reposition);
    window.removeEventListener('scroll', this.reposition, true);
    window.visualViewport?.removeEventListener('resize', this.reposition);
    window.visualViewport?.removeEventListener('scroll', this.reposition);
  }

  destroy(): void {
    clearTimeout(this.blurTimer);
    this.editor.off('blur', this.onBlur);
    this.hide();
  }
}
