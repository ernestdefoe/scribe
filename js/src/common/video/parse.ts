/**
 * Recognising a video link, and building the URLs for one.
 *
 * Pure functions over the registry in resources/video-providers.json, which is
 * passed in rather than imported so the node test can run this file on its own.
 *
 * 🚨 Hosts are compared EXACTLY, after the URL has been parsed by the browser's
 * own URL parser — never by searching the string. `youtube.com.evil.example`,
 * `evil.example/youtube.com/watch?v=…` and `youtube.com@evil.example` all have a
 * host that is not on any list, so they stay ordinary links.
 */

export interface VideoMatchRule {
  hosts: string[];
  path: string;
  query?: string;
}

export interface VideoProvider {
  name: string;
  brand?: string;
  icon?: string;
  aspect?: string;
  id: string;
  embed: string;
  embedStart?: string;
  watch: string;
  watchStart?: string;
  thumbnail?: string;
  match: VideoMatchRule[];
}

export type VideoRegistry = Record<string, VideoProvider>;

export interface VideoRef {
  provider: string;
  id: string;
  start?: number;
}

/** Longest URL worth looking at. A pasted paragraph is not a link. */
const MAX_URL = 2048;

const compiled = new Map<string, RegExp>();
function re(source: string): RegExp {
  let r = compiled.get(source);
  if (!r) compiled.set(source, (r = new RegExp(source)));
  return r;
}

/** Whether `id` is a valid id for `provider` — the same check the server makes. */
export function isValidVideoId(registry: VideoRegistry, provider: string, id: unknown): boolean {
  const def = Object.prototype.hasOwnProperty.call(registry, provider) ? registry[provider] : null;
  return !!def && typeof id === 'string' && re(`^(?:${def.id})$`).test(id);
}

/**
 * A start time in seconds from "90", "90s", "1m30s", "1h2m3s" or "01:30".
 * Anything else is no start time at all, rather than a guess.
 */
export function parseStart(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const v = value.trim();
  let seconds: number | undefined;

  if (/^\d+$/.test(v)) seconds = parseInt(v, 10);
  else if (/^\d+s$/.test(v)) seconds = parseInt(v, 10);
  else if (/^(?:\d+h)?(?:\d+m)?(?:\d+s)?$/.test(v) && v !== '') {
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v)!;
    seconds = +(m[1] || 0) * 3600 + +(m[2] || 0) * 60 + +(m[3] || 0);
  } else if (/^\d{1,2}(?::\d{1,2}){1,2}$/.test(v)) {
    seconds = v.split(':').reduce((total, part) => total * 60 + parseInt(part, 10), 0);
  }

  return seconds && seconds > 0 && seconds < 360000 ? seconds : undefined;
}

/**
 * The provider and id behind a pasted URL, or null when it is not a video this
 * registry can embed. `enabled`, when given, filters out providers an admin has
 * switched off.
 */
export function parseVideoUrl(registry: VideoRegistry, input: string, enabled?: (provider: string) => boolean): VideoRef | null {
  const text = (input || '').trim();
  if (!text || text.length > MAX_URL || /\s/.test(text)) return null;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  // A user:password@ part is never part of a real share link, and is the
  // classic way to make a lookalike read as the real host.
  if (url.username || url.password || url.port) return null;

  const host = url.hostname
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '');

  for (const key of Object.keys(registry)) {
    if (enabled && !enabled(key)) continue;
    const def = registry[key];

    for (const rule of def.match) {
      if (!rule.hosts.includes(host)) continue;
      const m = re(rule.path).exec(url.pathname);
      if (!m) continue;

      const id = rule.query ? url.searchParams.get(rule.query) : m.groups?.id;
      if (!isValidVideoId(registry, key, id)) continue;

      const ref: VideoRef = { provider: key, id: id as string };

      if (def.embedStart || def.watchStart) {
        const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
        const start = parseStart(url.searchParams.get('t') ?? url.searchParams.get('start') ?? hash.get('t'));
        if (start) ref.start = start;
      }

      return ref;
    }
  }

  return null;
}

function hms(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h${m}m${seconds % 60}s`;
}

function fill(template: string, ref: VideoRef, host = ''): string {
  return template
    .replace(/\{id\}/g, encodeURIComponent(ref.id))
    .replace(/\{startHms\}/g, ref.start ? hms(ref.start) : '')
    .replace(/\{start\}/g, ref.start ? String(ref.start) : '')
    .replace(/\{host\}/g, encodeURIComponent(host));
}

/**
 * The player URL, or null for anything that is not a valid provider/id pair.
 *
 * 🚨 This is the only place an iframe src is made, and it is made from the
 * registry template and a RE-VALIDATED id — never from anything read out of the
 * page's markup as a URL. A post that somehow carried a hostile data-id still
 * gets no player.
 */
export function buildEmbedSrc(registry: VideoRegistry, ref: VideoRef, host: string): string | null {
  if (!isValidVideoId(registry, ref.provider, ref.id)) return null;
  const def = registry[ref.provider];
  const start = ref.start && def.embedStart ? fill(def.embedStart, ref) : '';
  const src = fill(def.embed, ref, host);
  // A start fragment (#t=) has to come after the query, and the query may
  // already end the template.
  return src + start;
}

export function buildWatchUrl(registry: VideoRegistry, ref: VideoRef): string | null {
  if (!isValidVideoId(registry, ref.provider, ref.id)) return null;
  const def = registry[ref.provider];
  return fill(def.watch, ref) + (ref.start && def.watchStart ? fill(def.watchStart, ref) : '');
}

export function buildThumbnailUrl(registry: VideoRegistry, ref: VideoRef): string | null {
  if (!isValidVideoId(registry, ref.provider, ref.id)) return null;
  const def = registry[ref.provider];
  return def.thumbnail ? fill(def.thumbnail, ref) : null;
}
