/**
 * Video link recognition and URL building, tested against the real registry.
 *
 * 🚨 This decides whether a pasted link becomes an iframe in somebody's post,
 * so the cases that matter most are the ones that must NOT match: lookalike
 * hosts, credentials in the URL, ids carrying quotes or script. Every provider
 * also gets a valid case, so a typo in one provider's pattern fails here
 * instead of silently turning its links back into links.
 *
 *     npm test
 */

import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  parseVideoUrl,
  buildEmbedSrc,
  buildWatchUrl,
  buildThumbnailUrl,
  isValidVideoId,
  parseStart,
} from '../../.test-build/video/parse.js';

const registry = JSON.parse(fs.readFileSync(new URL('../../resources/video-providers.json', import.meta.url))).providers;

let failures = 0;
let passes = 0;
function check(name, fn) {
  try {
    fn();
    passes++;
  } catch (e) {
    failures++;
    console.error(`FAIL ${name}\n  ${e.message}`);
  }
}

const YT = 'dQw4w9WgXcQ';

// [url, provider, id, start?]
const VALID = [
  [`https://www.youtube.com/watch?v=${YT}`, 'youtube', YT],
  [`https://youtube.com/watch?v=${YT}&t=42`, 'youtube', YT, 42],
  [`https://m.youtube.com/watch?feature=share&v=${YT}&t=1m30s`, 'youtube', YT, 90],
  [`https://www.youtube.com/watch?v=${YT}&start=75`, 'youtube', YT, 75],
  [`https://youtu.be/${YT}`, 'youtube', YT],
  [`https://youtu.be/${YT}?t=1h2m3s`, 'youtube', YT, 3723],
  [`https://www.youtube.com/embed/${YT}`, 'youtube', YT],
  [`https://www.youtube-nocookie.com/embed/${YT}`, 'youtube', YT],
  [`https://www.youtube.com/live/${YT}?si=abc`, 'youtube', YT],
  [`https://WWW.YOUTUBE.COM/watch?v=${YT}`, 'youtube', YT],
  [`https://www.youtube.com/shorts/${YT}`, 'youtubeshorts', YT],
  [`https://m.youtube.com/shorts/${YT}?feature=share`, 'youtubeshorts', YT],
  ['https://vimeo.com/76979871', 'vimeo', '76979871'],
  ['https://vimeo.com/76979871#t=30s', 'vimeo', '76979871', 30],
  ['https://vimeo.com/channels/staffpicks/76979871', 'vimeo', '76979871'],
  ['https://player.vimeo.com/video/76979871', 'vimeo', '76979871'],
  ['https://www.facebook.com/watch/?v=1234567890123', 'facebook', '1234567890123'],
  ['https://www.facebook.com/watch?v=1234567890123', 'facebook', '1234567890123'],
  ['https://www.facebook.com/SomePage/videos/1234567890123/', 'facebook', '1234567890123'],
  ['https://m.facebook.com/SomePage/videos/a-title/1234567890123', 'facebook', '1234567890123'],
  ['https://www.facebook.com/video.php?v=1234567890123', 'facebook', '1234567890123'],
  ['https://www.facebook.com/reel/1234567890123', 'facebookreel', '1234567890123'],
  ['https://www.espn.com/video/clip?id=39876543', 'espn', '39876543'],
  ['https://www.espn.com/video/clip/_/id/39876543', 'espn', '39876543'],
  ['https://www.espn.com/video/clip/_/id/39876543/some-slug', 'espn', '39876543'],
  ['https://www.espn.co.uk/video/clip/_/id/39876543', 'espn', '39876543'],
  ['https://www.espn.com/watch/player?id=39876543', 'espn', '39876543'],
  ['https://www.instagram.com/p/C1a2B3c4D5e/', 'instagram', 'C1a2B3c4D5e'],
  ['https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=xyz', 'instagramreel', 'C1a2B3c4D5e'],
  ['https://www.instagram.com/someuser/reel/C1a2B3c4D5e/', 'instagramreel', 'C1a2B3c4D5e'],
  ['https://www.tiktok.com/@scout2015/video/6718335390845095173', 'tiktok', '6718335390845095173'],
  ['https://m.tiktok.com/v/6718335390845095173.html', 'tiktok', '6718335390845095173'],
  ['https://clips.twitch.tv/AwkwardHelplessSalamanderSwiftRage', 'twitchclip', 'AwkwardHelplessSalamanderSwiftRage'],
  ['https://www.twitch.tv/somechannel/clip/AwkwardHelplessSalamanderSwiftRage-abc123', 'twitchclip', 'AwkwardHelplessSalamanderSwiftRage-abc123'],
  ['https://clips.twitch.tv/embed?clip=AwkwardHelplessSalamander', 'twitchclip', 'AwkwardHelplessSalamander'],
  ['https://www.twitch.tv/videos/1234567890?t=1h2m3s', 'twitchvideo', '1234567890', 3723],
  ['https://streamable.com/moo2xy', 'streamable', 'moo2xy'],
  ['https://streamable.com/e/moo2xy', 'streamable', 'moo2xy'],
  ['https://www.dailymotion.com/video/x8abc12', 'dailymotion', 'x8abc12'],
  ['https://www.dailymotion.com/video/x8abc12_some-title', 'dailymotion', 'x8abc12'],
  ['https://dai.ly/x8abc12', 'dailymotion', 'x8abc12'],
  ['https://www.loom.com/share/0123456789abcdef0123456789abcdef', 'loom', '0123456789abcdef0123456789abcdef'],
  ['https://www.loom.com/share/0123456789abcdef0123456789abcdef?sid=1', 'loom', '0123456789abcdef0123456789abcdef'],
  ['https://sketchfab.com/models/559b4fe0bf8342f3ae25370ffaa40d0a', 'sketchfab', '559b4fe0bf8342f3ae25370ffaa40d0a'],
  ['https://sketchfab.com/models/559b4fe0bf8342f3ae25370ffaa40d0a/embed', 'sketchfab', '559b4fe0bf8342f3ae25370ffaa40d0a'],
  ['https://sketchfab.com/3d-models/the-great-drawing-room-559b4fe0bf8342f3ae25370ffaa40d0a', 'sketchfab', '559b4fe0bf8342f3ae25370ffaa40d0a'],
  ['https://www.sketchfab.com/3d-models/559b4fe0bf8342f3ae25370ffaa40d0a?utm_source=x', 'sketchfab', '559b4fe0bf8342f3ae25370ffaa40d0a'],
];

for (const [url, provider, id, start] of VALID) {
  check(`valid ${url}`, () => {
    const ref = parseVideoUrl(registry, url);
    assert.ok(ref, 'did not match');
    assert.equal(ref.provider, provider);
    assert.equal(ref.id, id);
    assert.equal(ref.start, start);
  });
}

check('every provider has at least one valid case', () => {
  const covered = new Set(VALID.map((v) => v[1]));
  for (const key of Object.keys(registry)) assert.ok(covered.has(key), `no valid case for ${key}`);
});

const REJECTED = [
  // Lookalike hosts and host confusion.
  `https://youtube.com.evil.example/watch?v=${YT}`,
  `https://evilyoutube.com/watch?v=${YT}`,
  `https://www.youtube.com@evil.example/watch?v=${YT}`,
  `https://user:pass@www.youtube.com/watch?v=${YT}`,
  `https://evil.example/www.youtube.com/watch?v=${YT}`,
  `https://evil.example/?u=https://www.youtube.com/watch?v=${YT}`,
  `https://www.youtube.com:8443/watch?v=${YT}`,
  'https://facebook.com@evil.example/watch/?v=1234567890123',
  'https://facebook.com.evil.example/reel/1234567890123',
  'https://notvimeo.com/76979871',
  'https://vimeo.com.evil.example/76979871',
  'https://tiktok.com.evil.example/@a/video/6718335390845095173',
  // Not http(s).
  `javascript:alert(1)//https://www.youtube.com/watch?v=${YT}`,
  `data:text/html,https://youtu.be/${YT}`,
  `ftp://youtu.be/${YT}`,
  // Bad ids: wrong length, quotes, script, path tricks.
  'https://www.youtube.com/watch?v=short',
  `https://www.youtube.com/watch?v=${YT}x`,
  'https://www.youtube.com/watch?v=dQw4w9WgXc"',
  'https://www.youtube.com/watch?v=" onerror="x',
  'https://www.youtube.com/watch?v=<script>12',
  `https://www.youtube.com/embed/${YT}/../../evil`,
  'https://vimeo.com/76979871/abcdef1234',
  'https://vimeo.com/abc',
  'https://www.facebook.com/watch/?v=12ab',
  'https://www.espn.com/watch/player?id=0b5e7f1a-uuid-like',
  'https://www.loom.com/share/not-a-hex-id',
  'https://sketchfab.com/models/559B4FE0BF8342F3AE25370FFAA40D0A',
  'https://sketchfab.com/models/559b4fe0bf8342f3ae25370ffaa40d0ax',
  'https://sketchfab.com/3d-models/thing-559b4fe0bf8342f3ae25370ffaa40d0a/../../evil',
  'https://sketchfab.com.evil.example/models/559b4fe0bf8342f3ae25370ffaa40d0a',
  'https://sketchfab.com/someone/models',
  'https://clips.twitch.tv/embed',
  'https://streamable.com/login',
  // Redirect links that need a request to resolve, and unsupported sites.
  'https://fb.watch/abcDEF123/',
  'https://vm.tiktok.com/ZMabc123/',
  'https://www.facebook.com/share/v/abc123/',
  'https://rumble.com/v4abcd-some-video.html',
  'https://x.com/someone/status/1234567890',
  'https://kick.com/someone?clip=clip_01ABC',
  // Not a lone URL.
  `watch this https://youtu.be/${YT}`,
  `https://youtu.be/${YT} and this`,
  '',
];

for (const url of REJECTED) {
  check(`rejected ${JSON.stringify(url)}`, () => assert.equal(parseVideoUrl(registry, url), null));
}

check('a provider switched off is not matched', () => {
  assert.equal(parseVideoUrl(registry, `https://youtu.be/${YT}`, (k) => k !== 'youtube'), null);
  assert.ok(parseVideoUrl(registry, 'https://vimeo.com/76979871', (k) => k !== 'youtube'));
});

check('embed URLs', () => {
  assert.equal(
    buildEmbedSrc(registry, { provider: 'youtube', id: YT, start: 42 }, 'forum.example'),
    `https://www.youtube-nocookie.com/embed/${YT}?autoplay=1&rel=0&start=42`
  );
  assert.equal(
    buildEmbedSrc(registry, { provider: 'vimeo', id: '76979871', start: 30 }, 'x'),
    'https://player.vimeo.com/video/76979871?dnt=1&autoplay=1#t=30s'
  );
  assert.equal(
    buildEmbedSrc(registry, { provider: 'facebookreel', id: '1234567890123' }, 'x'),
    'https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Freel%2F1234567890123&show_text=false&autoplay=true'
  );
  assert.equal(
    buildEmbedSrc(registry, { provider: 'twitchclip', id: 'AbcDef' }, 'forum.example'),
    'https://clips.twitch.tv/embed?clip=AbcDef&autoplay=true&parent=forum.example'
  );
  assert.equal(
    buildEmbedSrc(registry, { provider: 'twitchvideo', id: '123', start: 3723 }, 'forum.example'),
    'https://player.twitch.tv/?video=123&autoplay=true&parent=forum.example&time=1h2m3s'
  );
  assert.equal(
    buildEmbedSrc(registry, { provider: 'espn', id: '39876543' }, 'x'),
    'https://www.espn.com/core/video/iframe/_/id/39876543/'
  );
  assert.equal(
    buildEmbedSrc(registry, { provider: 'sketchfab', id: '559b4fe0bf8342f3ae25370ffaa40d0a' }, 'x'),
    'https://sketchfab.com/models/559b4fe0bf8342f3ae25370ffaa40d0a/embed?autostart=1'
  );
});

check('no embed, watch or thumbnail URL for an invalid pair', () => {
  for (const ref of [
    { provider: 'youtube', id: '"><script>' },
    { provider: 'youtube', id: '0123456789abcdef0123456789abcdef' },
    { provider: 'nope', id: YT },
    { provider: '__proto__', id: YT },
    { provider: 'constructor', id: YT },
  ]) {
    assert.equal(buildEmbedSrc(registry, ref, 'x'), null, JSON.stringify(ref));
    assert.equal(buildWatchUrl(registry, ref), null, JSON.stringify(ref));
    assert.equal(buildThumbnailUrl(registry, ref), null, JSON.stringify(ref));
  }
});

check('watch and thumbnail URLs', () => {
  assert.equal(buildWatchUrl(registry, { provider: 'youtube', id: YT, start: 5 }), `https://www.youtube.com/watch?v=${YT}&t=5s`);
  assert.equal(buildThumbnailUrl(registry, { provider: 'youtube', id: YT }), `https://i.ytimg.com/vi/${YT}/hqdefault.jpg`);
  assert.equal(buildThumbnailUrl(registry, { provider: 'vimeo', id: '1' }), null);
});

check('every provider\'s templates are https and use {id}', () => {
  for (const [key, def] of Object.entries(registry)) {
    for (const field of ['embed', 'watch', 'thumbnail']) {
      if (!def[field]) continue;
      assert.match(def[field], /^https:\/\/[a-z0-9.-]+\//, `${key}.${field}`);
      assert.ok(def[field].includes('{id}'), `${key}.${field} has no {id}`);
    }
  }
});

check('start times', () => {
  assert.equal(parseStart('90'), 90);
  assert.equal(parseStart('90s'), 90);
  assert.equal(parseStart('1m30s'), 90);
  assert.equal(parseStart('1h'), 3600);
  assert.equal(parseStart('01:30'), 90);
  assert.equal(parseStart('0'), undefined);
  assert.equal(parseStart('abc'), undefined);
  assert.equal(parseStart(''), undefined);
});

console.log(`${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
