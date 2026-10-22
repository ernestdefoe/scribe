import app from 'flarum/forum/app';
import { override } from 'flarum/common/extend';
import TextEditor from 'flarum/common/components/TextEditor';
import CommentPost from 'flarum/forum/components/CommentPost';
import ScribeEditorDriver from '../common/ScribeEditorDriver';
import { applyReplyGates } from './replyGate';
import { installVideoEmbeds, localiseVideos } from './videoEmbeds';
import { installMobileComposer } from './mobileComposer';

export { default as ScribeEditorDriver } from '../common/ScribeEditorDriver';
export { SCRIBE_BUTTONS, DEFAULT_TOOLBAR, allButtons } from '../common/toolbarButtons';
export type { ScribeButton } from '../common/toolbarButtons';
/*
 * The seam other extensions build against. Exported from BOTH bundles: a node
 * only matters in the composer, but a button has to be registered in admin too
 * or it never appears in the toolbar builder for anyone to place.
 */
export { registerExtension, registerButton } from '../common/registry';
export type { ScribeTiptapKit, ScribeExtensionFactory } from '../common/registry';

app.initializers.add('ernestdefoe/scribe', () => {
  // One delegated listener for every video facade, present and future.
  installVideoEmbeds();

  // Phones: the composer fits the space above the keyboard, its buttons in the toolbar.
  installMobileComposer();

  /*
   * `buildEditor` is the sanctioned seam: core calls it with the container and
   * expects an EditorDriverInterface back. Replacing it is the whole of the
   * integration — nothing about the composer, its buttons or its submit path
   * needs to know which editor is underneath.
   */
  override(TextEditor.prototype, 'buildEditor', function (_original: any, dom: HTMLElement) {
    // @ts-ignore — buildEditorParams is core's, untyped in dist-typings.
    return new ScribeEditorDriver(dom, this.buildEditorParams());
  });

  /*
   * 🚨 Core focuses the composer with `.Composer-content :input:enabled:visible,
   * .TextEditor-editor` and takes the first match. `:input` includes <button>,
   * and the toolbar sits above the editor, so clicking Reply focused the Bold
   * button and the person had to click into the editor before typing. Same
   * selector, minus the toolbar; a body's own focusOnSelector (the discussion
   * title) still wins. Composer is a lazy chunk in Flarum 2, so it is named by
   * path — importing it would patch a copy core never uses.
   */
  override('flarum/forum/components/Composer', 'focus', function (this: any, original: any) {
    if (this.attrs.state.body.componentClass.focusOnSelector) return original();
    this.$('.Composer-content :input:enabled:visible, .TextEditor-editor').not('.Scribe-toolbarMount *').first().focus();
  });

  /*
   * `refreshContent` is core's own seam for "the rendered HTML just landed
   * in the DOM" — it already re-runs on both oncreate and onupdate (see
   * CommentPost.js), which is exactly when a [reply] gate's lock state needs
   * rechecking: on first paint, and again if this post's content changes.
   */
  override(CommentPost.prototype, 'refreshContent', function (original: any) {
    original();
    // `this.element` and `this.attrs` are Mithril component internals, untyped
    // in dist-typings.
    const element = (this as any).element as HTMLElement | undefined;
    if (element) {
      applyReplyGates(element, (this as any).attrs.post);
      try {
        localiseVideos(element);
      } catch (e) {
        // Cosmetic only: the facade already works as a link without it.
        console.error('[Scribe] could not localise video labels:', e);
      }
    }
  });
});
