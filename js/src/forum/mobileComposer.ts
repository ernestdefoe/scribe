import app from 'flarum/forum/app';
import { extend, override } from 'flarum/common/extend';

/*
 * 🚨 On a phone, core's composer is a 350px box pinned to the top of the screen
 * (`height: 350px !important`), with a backdrop over the rest of the page. The
 * editor fits in it only because core shrinks `.Composer-flexible` to whatever
 * the box leaves over once the controls row under it is counted.
 *
 * Scribe adds a toolbar above the editable, so the box ran out: the editor kept
 * its floor, pushed the controls row (preview, FoF Upload, mentions, emoji…)
 * out of the bottom of the white panel, and it hung over the page behind — and,
 * in Firefox, under the on-screen keyboard (Dr_Sommer, d/39790/42).
 *
 * So on a phone, while Scribe is the editor, the composer is sized to the
 * VISUAL viewport — the part of the screen the keyboard leaves — and the
 * editable takes exactly what is left of it. The controls row moves above the
 * editable, into the toolbar (forum.less), so it can never be the thing that
 * falls off the bottom. Chrome shrinks the visual viewport for the keyboard
 * and fires no window `resize`; Firefox and Safari pan it. visualViewport
 * reports all three, so it is the only measure used.
 */
const FIT = 'Scribe-fitViewport';

function fit(composer: any): void {
  const el: HTMLElement | undefined = composer.element;
  if (!el) return;

  const position = composer.state.position;
  const Position = composer.state.constructor.Position || {};
  const flexible = el.querySelector<HTMLElement>('.Scribe-editor.Composer-flexible');
  const on = !!flexible && app.screen() === 'phone' && (position === Position.NORMAL || position === Position.FULLSCREEN);

  el.classList.toggle(FIT, on);
  if (!on) return;

  const vv = window.visualViewport;
  // core makes the composer `position: absolute` on iOS Safari (flarum/core#2652),
  // where `top` is measured from the document, not the screen.
  const absolute = getComputedStyle(el).position === 'absolute';
  const height = vv ? vv.height : window.innerHeight;
  const top = vv ? (absolute ? vv.pageTop : vv.offsetTop) : absolute ? window.scrollY : 0;

  el.style.setProperty('--scribe-vv-height', `${Math.round(height)}px`);
  el.style.setProperty('--scribe-vv-top', `${Math.round(top)}px`);

  // Whatever is left between the end of the composer's content and its bottom
  // edge goes to the editable (negative when the content overflows).
  const content = el.querySelector<HTMLElement>('.Composer-content') || el;
  const gap = el.getBoundingClientRect().bottom - content.getBoundingClientRect().bottom;
  if (Math.abs(gap) < 1) return;

  const next = Math.max(80, Math.round(flexible.getBoundingClientRect().height + gap));
  flexible.style.height = `${next}px`;
}

export function installMobileComposer(): void {
  /*
   * Composer is a lazy chunk in Flarum 2: named by path, or these patch a copy
   * core never uses (see the focus override in index.ts).
   */
  override('flarum/forum/components/Composer', 'updateHeight', function (this: any, original: () => void) {
    original();
    fit(this);
  });

  extend('flarum/forum/components/Composer', 'oncreate', function (this: any) {
    let frame = 0;
    const refit = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        fit(this);
      });
    };

    window.visualViewport?.addEventListener('resize', refit);
    window.visualViewport?.addEventListener('scroll', refit);

    // The toolbar draws itself after the editor chunk loads, outside Flarum's
    // redraw, and a prompt (link, colour…) can open under it at any time; both
    // move the editable's top edge without telling core.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refit);
    if (observer && this.element) {
      const content = this.element.querySelector('.Composer-content');
      if (content) observer.observe(content);
    }

    this.scribeUnfit = () => {
      cancelAnimationFrame(frame);
      window.visualViewport?.removeEventListener('resize', refit);
      window.visualViewport?.removeEventListener('scroll', refit);
      observer?.disconnect();
    };
  });

  extend('flarum/forum/components/Composer', 'onremove', function (this: any) {
    this.scribeUnfit?.();
  });
}
