import app from 'flarum/forum/app';
import { override } from 'flarum/common/extend';
import TextEditor from 'flarum/common/components/TextEditor';
import CommentPost from 'flarum/forum/components/CommentPost';
import ScribeEditorDriver from '../common/ScribeEditorDriver';
import { applyReplyGates } from './replyGate';

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
   * `refreshContent` is core's own seam for "the rendered HTML just landed
   * in the DOM" — it already re-runs on both oncreate and onupdate (see
   * CommentPost.js), which is exactly when a [reply] gate's lock state needs
   * rechecking: on first paint, and again if this post's content changes.
   */
  override(CommentPost.prototype, 'refreshContent', function (original: any) {
    original();
    // @ts-ignore — `this.element` and `this.attrs` are Mithril component
    // internals, untyped in dist-typings.
    if (this.element) applyReplyGates(this.element, this.attrs.post);
  });
});
