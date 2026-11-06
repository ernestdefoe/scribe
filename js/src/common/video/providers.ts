import app from 'flarum/common/app';
import registryJson from '../../../../resources/video-providers.json';
import {
  parseVideoUrl as parse,
  buildEmbedSrc as embed,
  buildWatchUrl as watch,
  buildThumbnailUrl as thumbnail,
  isValidVideoId as valid,
  type VideoRef,
  type VideoRegistry,
} from './parse';

export type { VideoRef } from './parse';

/** The same registry the server builds its tag from. */
export const VIDEO_PROVIDERS: VideoRegistry = (registryJson as any).providers;

/**
 * Whether embedding is switched on, and for which providers.
 *
 * 🚨 Read at USE time, never at module load: `app.forum` does not exist yet
 * when an initializer's module is evaluated.
 */
export function videoEmbedsEnabled(): boolean {
  return app.forum?.attribute<boolean>('scribeVideoEmbeds') !== false;
}

export function videoProviderEnabled(provider: string): boolean {
  if (!videoEmbedsEnabled()) return false;
  const off = app.forum?.attribute<string[]>('scribeVideoOff') || [];
  return Object.prototype.hasOwnProperty.call(VIDEO_PROVIDERS, provider) && !off.includes(provider);
}

/** A pasted or typed URL, as an embeddable video — only for providers that are on. */
export function videoFromUrl(url: string): VideoRef | null {
  return parse(VIDEO_PROVIDERS, url, videoProviderEnabled);
}

/** Recognised by the registry at all, whatever the admin has switched off. */
export function anyVideoFromUrl(url: string): VideoRef | null {
  return parse(VIDEO_PROVIDERS, url);
}

export const isValidVideo = (provider: string, id: unknown) => valid(VIDEO_PROVIDERS, provider, id);
export const embedSrc = (ref: VideoRef, host: string) => embed(VIDEO_PROVIDERS, ref, host);
export const watchUrl = (ref: VideoRef) => watch(VIDEO_PROVIDERS, ref);
export const thumbnailUrl = (ref: VideoRef) => thumbnail(VIDEO_PROVIDERS, ref);

/** The name shown on a poster and in "Watch on …": the company, not the format. */
export function videoBrand(provider: string): string {
  const def = VIDEO_PROVIDERS[provider];
  return def ? (def.brand ?? def.name) : provider;
}

/** A label's key under forum.video: a 3D model is viewed, not played. */
export function videoLabelKey(provider: string, key: 'play' | 'watch_on' | 'player_title'): string {
  if (VIDEO_PROVIDERS[provider]?.kind !== 'model') return key;
  return { play: 'play_model', watch_on: 'view_on', player_title: 'model_viewer_title' }[key];
}

/** Permissions a provider's player needs beyond the ones every player gets. */
export function videoAllow(provider: string): string {
  const extra = VIDEO_PROVIDERS[provider]?.allow;
  const base = 'autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write';
  return extra && /^[a-z-]+(?:; [a-z-]+)*$/.test(extra) ? `${base}; ${extra}` : base;
}

/** "16:9" → "16x9", the suffix of the Scribe-video--r* class the stylesheet sizes by. */
export function videoRatioClass(provider: string): string {
  return 'Scribe-video--r' + (VIDEO_PROVIDERS[provider]?.aspect ?? '16:9').replace(':', 'x');
}
