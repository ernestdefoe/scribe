import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import { allButtons, DEFAULT_TOOLBAR, type ScribeButton } from '../../common/toolbarButtons';

declare const m: any;

const SETTING = 'ernestdefoe-scribe.toolbar';
const t = (k: string) => app.translator.trans('ernestdefoe-scribe.admin.' + k);

/**
 * Drag features from the palette into the toolbar, and drag within the toolbar
 * to order it.
 *
 * 🚨 Drag and drop, never up/down arrows. Arrows are how you move one item at a
 * time and lose your place; arranging a toolbar is a spatial task and should
 * look like one. Keyboard users are not left out — every item is focusable and
 * responds to arrow keys and Enter, so there are two real ways to do this
 * rather than one good one and one nobody uses.
 */
export interface ToolbarBuilderAttrs {
  /** The ExtensionPage's setting stream, so its own Save button persists this. */
  setting: (value?: string) => string;
}

export default class ToolbarBuilder extends Component<ToolbarBuilderAttrs> {
  keys: string[] = [];
  dragKey: string | null = null;
  dragFrom: 'toolbar' | 'palette' | null = null;
  dropIndex: number | null = null;

  oninit(vnode: any) {
    super.oninit(vnode);
    this.keys = this.load();
  }

  /** Push the arrangement into the page's stream; its Save button does the rest. */
  commit(next: string[]) {
    this.keys = next;
    this.attrs.setting(JSON.stringify(next));
  }

  load(): string[] {
    const raw = this.attrs.setting() ?? app.data.settings?.[SETTING];
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.length) {
        // Drop keys this version no longer knows about, so a setting saved by a
        // newer build cannot render an empty control here.
        const known = new Set(allButtons().map((b) => b.key));
        return parsed.filter((k: string) => known.has(k));
      }
    } catch (e) {
      // A corrupt value is not worth an error dialog — fall back to defaults and
      // let saving overwrite it.
    }
    return [...DEFAULT_TOOLBAR];
  }

  byKey(key: string): ScribeButton | undefined {
    return allButtons().find((b) => b.key === key);
  }

  get palette(): ScribeButton[] {
    return allButtons().filter((b) => !this.keys.includes(b.key));
  }

  view() {
    return (
      <div className="ScribeToolbarBuilder Form-group">
        <label>{t('toolbar_label')}</label>
        <div className="helpText">{t('toolbar_help')}</div>

        <div
          className={'ScribeBuilder-toolbar' + (this.dragKey ? ' is-dropTarget' : '')}
          ondragover={(e: DragEvent) => {
            e.preventDefault();
            this.dropIndex = this.indexFromPointer(e);
          }}
          ondrop={(e: DragEvent) => this.onDrop(e)}
          ondragleave={() => { this.dropIndex = null; }}
        >
          {this.keys.length === 0 && <div className="ScribeBuilder-empty">{t('toolbar_empty')}</div>}
          {this.keys.map((key, i) => this.chip(this.byKey(key)!, i, 'toolbar'))}
        </div>

        <label className="ScribeBuilder-paletteLabel">{t('palette_label')}</label>
        <div
          className="ScribeBuilder-palette"
          ondragover={(e: DragEvent) => e.preventDefault()}
          ondrop={(e: DragEvent) => {
            e.preventDefault();
            // Dropping back into the palette removes it from the toolbar.
            if (this.dragFrom === 'toolbar' && this.dragKey) {
              this.commit(this.keys.filter((k) => k !== this.dragKey));
            }
            this.endDrag();
          }}
        >
          {this.palette.length === 0 && <div className="ScribeBuilder-empty">{t('palette_empty')}</div>}
          {this.palette.map((b) => this.chip(b, -1, 'palette'))}
        </div>

        <div className="ScribeBuilder-actions">
          {/*
            * 🚨 No Save button here. The extension page already ends with one,
            * and a second button that also says "Save Changes" makes the reader
            * work out which of the two is the real one. Changes go into the
            * page's own setting stream, so its Save persists them along with
            * everything else on the page.
            */}
          {Button.component(
            { className: 'Button Button--link', onclick: () => this.commit([...DEFAULT_TOOLBAR]) },
            t('reset')
          )}
        </div>
      </div>
    );
  }

  chip(b: ScribeButton, index: number, where: 'toolbar' | 'palette') {
    if (!b) return null;
    const label = app.translator.trans(`ernestdefoe-scribe.lib.buttons.${b.label}`);
    const isDropBefore = where === 'toolbar' && this.dropIndex === index && this.dragKey;

    return (
      <div
        className={
          'ScribeBuilder-chip' +
          (this.dragKey === b.key ? ' is-dragging' : '') +
          (isDropBefore ? ' is-dropBefore' : '')
        }
        draggable={true}
        tabindex="0"
        data-index={index}
        aria-label={label}
        title={label}
        ondragstart={(e: DragEvent) => {
          this.dragKey = b.key;
          this.dragFrom = where;
          // Firefox refuses to start a drag unless data is set.
          e.dataTransfer?.setData('text/plain', b.key);
          e.dataTransfer!.effectAllowed = 'move';
        }}
        ondragend={() => this.endDrag()}
        onkeydown={(e: KeyboardEvent) => this.onKey(e, b, index, where)}
      >
        <i className={b.icon} aria-hidden="true" data-badge={b.badge} />
        <span className="ScribeBuilder-chipLabel">{label}</span>
      </div>
    );
  }

  /**
   * Which slot the pointer is nearest, so the chip lands where it looks like
   * it will.
   *
   * 🚨 Row-aware. The toolbar wraps onto a second line once it's full — an
   * X-only comparison against every chip regardless of row always resolved
   * to a first-row index, because the loop returns on the first chip whose
   * *horizontal* midpoint the pointer hasn't reached yet, and a first-row
   * chip's box can satisfy that check even while the pointer sits over row
   * two. Group chips into rows by their `top` first, pick the row nearest
   * the pointer's Y, then do the X comparison only within that row.
   */
  indexFromPointer(e: DragEvent): number {
    const chips = Array.from(
      (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.ScribeBuilder-chip')
    );
    if (!chips.length) return 0;

    const rects = chips.map((el) => el.getBoundingClientRect());
    const rows: number[][] = [];
    rects.forEach((r, i) => {
      const row = rows.find((row) => Math.abs(rects[row[0]].top - r.top) < 4);
      if (row) row.push(i);
      else rows.push([i]);
    });

    const targetRow = rows.reduce((best, row) => {
      const center = (rects: DOMRect[], row: number[]) => rects[row[0]].top + rects[row[0]].height / 2;
      return Math.abs(e.clientY - center(rects, row)) < Math.abs(e.clientY - center(rects, best))
        ? row
        : best;
    }, rows[0]);

    for (const i of targetRow) {
      if (e.clientX < rects[i].left + rects[i].width / 2) return i;
    }
    return targetRow[targetRow.length - 1] + 1;
  }

  onDrop(e: DragEvent) {
    e.preventDefault();
    if (!this.dragKey) return;
    const at = this.dropIndex ?? this.keys.length;
    const without = this.keys.filter((k) => k !== this.dragKey);
    // When moving within the toolbar, removing first shifts everything after
    // the old position left by one — so the insertion point moves too.
    const adjusted = this.dragFrom === 'toolbar' && this.keys.indexOf(this.dragKey) < at ? at - 1 : at;
    without.splice(Math.max(0, Math.min(adjusted, without.length)), 0, this.dragKey);
    this.commit(without);
    this.endDrag();
  }

  /** Keyboard equivalent: arrows move or insert, Delete removes. */
  onKey(e: KeyboardEvent, b: ScribeButton, index: number, where: 'toolbar' | 'palette') {
    if (where === 'palette' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      this.commit([...this.keys, b.key]);
    } else if (where === 'toolbar' && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      this.commit(this.keys.filter((k) => k !== b.key));
    } else if (where === 'toolbar' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const to = index + (e.key === 'ArrowLeft' ? -1 : 1);
      if (to < 0 || to >= this.keys.length) return;
      const next = [...this.keys];
      [next[index], next[to]] = [next[to], next[index]];
      this.commit(next);
    }
  }

  endDrag() {
    this.dragKey = null;
    this.dragFrom = null;
    this.dropIndex = null;
  }

}
