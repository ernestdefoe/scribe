import app from 'flarum/forum/app';
import extractText from 'flarum/common/utils/extractText';
import type Mithril from 'mithril';

declare const m: Mithril.Static;

/**
 * Whether the current user has unlocked a [reply]-gated block: they authored
 * the post it's in, or they've posted a comment in that discussion.
 *
 * 🚨 Enforced server-side by ReplyGate (src/Formatter/ReplyGate.php): a
 * viewer who has not replied gets the gate with its content removed and
 * `data-withheld` set. For everyone else the content ships and this decides
 * which half is visible, as before. It stays reactive: a reply the user just
 * posted is already in `app.store` the moment the request resolves, so the
 * next redraw sees it, and any post whose gate was withheld is fetched once
 * more, now with its content, without a page reload.
 *
 * 🚨 Cached per discussion+user for the session, not re-queried on every
 * redraw. `undefined` (not yet known) renders as locked — see
 * applyReplyGates — so a slow lookup never flashes gated content before
 * hiding it again.
 */
const cache = new Map<string, boolean>();
const pending = new Set<string>();
const refetched = new Set<string>();

function hasReplied(discussionId: string): boolean | undefined {
  const user = app.session.user;
  if (!user) return false;

  const key = `${discussionId}:${user.id()}`;
  if (cache.get(key)) return true;

  // A comment they just posted is in the store before any lookup could say so.
  const posted = app.store
    .all('posts')
    .some((p: any) => p.contentType?.() === 'comment' && p.user?.() === user && p.discussion?.()?.id?.() === discussionId);
  if (posted) {
    cache.set(key, true);
    return true;
  }

  if (cache.has(key)) return cache.get(key);

  if (!pending.has(key)) {
    pending.add(key);

    app.store
      .find('posts', {
        filter: { discussion: discussionId, author: user.username(), type: 'comment' },
        page: { limit: 1 },
      })
      .then((posts: unknown[]) => {
        cache.set(key, posts.length > 0);
        pending.delete(key);
        m.redraw();
      })
      .catch(() => {
        // Network hiccup: stay locked rather than cache a false negative
        // forever — the next render retries since nothing was cached.
        pending.delete(key);
      });
  }

  return undefined;
}

/**
 * Called after a CommentPost's content is in the DOM (see forum/index.ts).
 * `post.contentHtml()` already contains both `.Scribe-replyGateLocked` and
 * `.Scribe-replyGateBody` for every gate in the post — this only decides
 * which one `.is-unlocked` (forum.less) makes visible.
 */
export function applyReplyGates(element: HTMLElement, post: any): void {
  const gates = element.querySelectorAll<HTMLElement>('.Scribe-replyGate');
  if (!gates.length) return;

  const discussion = post.discussion();
  const unlocked = post.user() === app.session.user || (discussion && hasReplied(discussion.id()));

  // The locked message is compiled into the post HTML in the forum's DEFAULT
  // locale - an XSL template cannot ask the translator anything, and the render
  // is cached for everyone. Rewriting it here is what gets each reader the
  // message in their OWN language. Configure::resolveTokens leaves a sensible
  // sentence there for the case where this never runs.
  const label = extractText(app.translator.trans('ernestdefoe-scribe.forum.reply_gate.locked'));

  // The server left this post's gated content out because the viewer had not
  // replied when it was rendered. Now they have: fetch it again, once.
  if (unlocked === true && post.id() && !refetched.has(post.id()) && element.querySelector('.Scribe-replyGate[data-withheld]')) {
    refetched.add(post.id());
    app.store
      .find('posts', post.id())
      .then(() => m.redraw())
      .catch(() => refetched.delete(post.id()));
  }

  gates.forEach((gate) => {
    const locked = gate.querySelector<HTMLElement>('.Scribe-replyGateLocked');

    if (locked && label && locked.textContent !== label) {
      locked.textContent = label;
    }

    gate.classList.toggle('is-unlocked', unlocked === true);
  });
}
