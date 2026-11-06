import app from 'flarum/forum/app';
import extractText from 'flarum/common/utils/extractText';
import { embedSrc, isValidVideo, videoAllow, videoBrand, videoLabelKey, videoProviderEnabled } from '../common/video/providers';

/**
 * Click-to-load: the rendered video is a facade (a thumbnail or poster, linking
 * to the video) until the reader asks for it. Only then is the provider's
 * player requested — which is the point for a UK forum: no player, no cookies,
 * no tracking script for a reader who never pressed play.
 *
 * 🚨 ONE listener on the document, not one per facade. Posts are redrawn and
 * arrive live (realtime, "load more", an edit) and a per-element binding made at
 * render time misses every one of them. A delegated listener sees whatever is
 * in the page when the click happens, however it got there.
 *
 * 🚨 The iframe src is rebuilt from the registry and the facade's data-provider
 * and data-id, re-validated against the provider's id pattern. Nothing read from
 * the page is ever used as a URL.
 */
let installed = false;

export function installVideoEmbeds(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  document.addEventListener('click', onActivate, true);
  document.addEventListener('keydown', onKey, true);
}

function facadeFrom(target: EventTarget | null): HTMLAnchorElement | null {
  const el = target instanceof Element ? target.closest('.Scribe-videoFacade') : null;
  // Only a rendered post's facade, never the one in the composer (a div there).
  return el instanceof HTMLAnchorElement && !el.closest('.Scribe-editor') ? el : null;
}

function onKey(event: KeyboardEvent): void {
  // A link answers to Enter already; a facade that says it is a button should
  // answer to Space as well.
  if (event.key !== ' ' && event.key !== 'Spacebar') return;
  const facade = facadeFrom(event.target);
  if (facade && play(facade)) event.preventDefault();
}

function onActivate(event: MouseEvent): void {
  // Ctrl/⌘/middle-click: the reader asked for a new tab, and the link does that.
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const facade = facadeFrom(event.target);
  if (!facade) return;
  if (play(facade)) {
    event.preventDefault();
    event.stopPropagation();
  }
}

/** Swap the facade for the player. False leaves the link to do its job. */
function play(facade: HTMLAnchorElement): boolean {
  const figure = facade.closest<HTMLElement>('.Scribe-video');
  if (!figure) return false;

  const provider = figure.dataset.provider || '';
  const id = figure.dataset.id || '';
  const start = parseInt(figure.dataset.start || '', 10) || undefined;

  // Switched off in the AdminCP: the facade stays what it is, a link.
  if (!videoProviderEnabled(provider) || !isValidVideo(provider, id)) return false;

  const src = embedSrc({ provider, id, start }, window.location.hostname);
  if (!src) return false;

  const frame = document.createElement('iframe');
  frame.className = 'Scribe-videoFrame';
  frame.src = src;
  frame.title = extractText(
    app.translator.trans(`ernestdefoe-scribe.forum.video.${videoLabelKey(provider, 'player_title')}`, { provider: videoBrand(provider) })
  );
  frame.allow = videoAllow(provider);
  frame.allowFullscreen = true;
  // YouTube refuses to play (error 153) without a referrer; this sends the
  // origin only, never the page path.
  frame.referrerPolicy = 'strict-origin-when-cross-origin';

  facade.replaceWith(frame);
  figure.classList.add('is-playing');
  frame.focus();

  return true;
}

/**
 * The labels in a rendered video were compiled in the forum's default locale
 * (an XSL template cannot ask the translator per reader). Rewrite them in the
 * reader's own, and mark the facade as the button it behaves as.
 */
export function localiseVideos(element: HTMLElement): void {
  element.querySelectorAll<HTMLElement>('.Scribe-video').forEach((figure) => {
    const provider = figure.dataset.provider || '';
    const brand = videoBrand(provider);
    const facade = figure.querySelector<HTMLAnchorElement>('a.Scribe-videoFacade');

    if (facade && videoProviderEnabled(provider)) {
      facade.setAttribute('role', 'button');
      facade.setAttribute(
        'aria-label',
        extractText(app.translator.trans(`ernestdefoe-scribe.forum.video.${videoLabelKey(provider, 'play')}`, { provider: brand }))
      );
    }

    const watch = figure.querySelector<HTMLElement>('.Scribe-videoWatchText');
    const label = extractText(app.translator.trans(`ernestdefoe-scribe.forum.video.${videoLabelKey(provider, 'watch_on')}`, { provider: brand }));
    if (watch && label && watch.textContent !== label) watch.textContent = label;
  });
}
