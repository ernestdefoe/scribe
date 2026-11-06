<?php

namespace ErnestDefoe\Scribe\Tests\Formatter;

use ErnestDefoe\Scribe\Formatter\Configure;
use ErnestDefoe\Scribe\Formatter\VideoEmbed;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use s9e\TextFormatter\Configurator;

/**
 * The video tag through the real formatter: Scribe's Configure on a fresh
 * s9e Configurator, plus Autolink, which Flarum always has on.
 *
 * 🚨 This is the security boundary for embeds. Whatever reaches the API —
 * not just what the editor emits — has to come out either as a facade built
 * from a validated id, or not as a video at all.
 */
class VideoEmbedTest extends TestCase
{
    private static $parser;
    private static $renderer;
    private static string $js = '';

    public static function setUpBeforeClass(): void
    {
        $config = new Configurator();
        // The plugins Flarum always runs over post text. Each of them once
        // reached inside a <video> start tag and tore it apart.
        $config->plugins->load('Autolink');
        $config->plugins->load('HTMLEntities');
        $config->plugins->load('Emoji');
        (new Configure())($config);
        $config->enableJavaScript();

        $built = $config->finalize();
        self::$parser = $built['parser'];
        self::$renderer = $built['renderer'];
        self::$js = (string) $config->javascript->getParser();
    }

    private function render(string $html): string
    {
        return self::$renderer->render(self::$parser->parse($html));
    }

    private function video(string $provider, string $id, array $extra = [], string $caption = ''): string
    {
        $attrs = 'data-provider="'.$provider.'" data-id="'.$id.'"';
        foreach ($extra as $name => $value) {
            $attrs .= ' data-'.$name.'="'.$value.'"';
        }

        return '<video '.$attrs.'>'.$caption.'</video>';
    }

    public static function validIds(): array
    {
        return [
            'youtube' => ['youtube', 'dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
            'youtube shorts' => ['youtubeshorts', 'dQw4w9WgXcQ', 'https://www.youtube.com/shorts/dQw4w9WgXcQ'],
            'vimeo' => ['vimeo', '76979871', 'https://vimeo.com/76979871'],
            'facebook' => ['facebook', '1234567890123', 'https://www.facebook.com/watch/?v=1234567890123'],
            'facebook reel' => ['facebookreel', '1234567890123', 'https://www.facebook.com/reel/1234567890123'],
            'espn' => ['espn', '39876543', 'https://www.espn.com/video/clip/_/id/39876543'],
            'instagram' => ['instagram', 'C1a2B3c4D5e', 'https://www.instagram.com/p/C1a2B3c4D5e/'],
            'instagram reel' => ['instagramreel', 'C1a2B3c4D5e', 'https://www.instagram.com/reel/C1a2B3c4D5e/'],
            'tiktok' => ['tiktok', '6718335390845095173', 'https://m.tiktok.com/v/6718335390845095173.html'],
            'twitch clip' => ['twitchclip', 'AwkwardHelplessSalamander-x1', 'https://clips.twitch.tv/AwkwardHelplessSalamander-x1'],
            'twitch video' => ['twitchvideo', '1234567890', 'https://www.twitch.tv/videos/1234567890'],
            'streamable' => ['streamable', 'moo2xy', 'https://streamable.com/moo2xy'],
            'dailymotion' => ['dailymotion', 'x8abc12', 'https://www.dailymotion.com/video/x8abc12'],
            'loom' => ['loom', '0123456789abcdef0123456789abcdef', 'https://www.loom.com/share/0123456789abcdef0123456789abcdef'],
            'sketchfab' => ['sketchfab', '559b4fe0bf8342f3ae25370ffaa40d0a', 'https://sketchfab.com/models/559b4fe0bf8342f3ae25370ffaa40d0a'],
        ];
    }

    #[DataProvider('validIds')]
    public function test_a_valid_id_renders_a_facade_linking_to_the_video(string $provider, string $id, string $watch): void
    {
        $html = $this->render($this->video($provider, $id));

        $this->assertStringContainsString('<figure class="Scribe-video ', $html);
        $this->assertStringContainsString('data-provider="'.$provider.'"', $html);
        $this->assertStringContainsString('data-id="'.$id.'"', $html);
        $this->assertStringContainsString('href="'.htmlspecialchars($watch).'"', $html);
        // Click-to-load: there is never a player in the stored render.
        $this->assertStringNotContainsString('<iframe', $html);
        $this->assertStringNotContainsString('&lt;', $html, 'raw markup leaked as text');
    }

    public function test_every_provider_in_the_registry_is_covered(): void
    {
        $this->assertEqualsCanonicalizing(
            array_keys(VideoEmbed::providers()),
            array_column(self::validIds(), 0)
        );
    }

    public function test_start_time_and_caption_render(): void
    {
        $html = $this->render($this->video('youtube', 'dQw4w9WgXcQ', ['start' => '42'], 'Full match &amp; more: https://example.com'));

        $this->assertStringContainsString('data-start="42"', $html);
        $this->assertStringContainsString('watch?v=dQw4w9WgXcQ&amp;t=42s', $html);
        // The caption is ordinary post text, rendered as such.
        $this->assertMatchesRegularExpression('#<span class="Scribe-videoCaption">Full match &amp; more: (?:<a href="https://example.com">)?https://example.com(?:</a>)?</span>#', $html);
        $this->assertStringNotContainsString('&lt;', $html, 'the start tag was torn apart');
    }

    public function test_no_caption_renders_no_caption_element(): void
    {
        $this->assertStringNotContainsString('Scribe-videoCaption', $this->render($this->video('youtube', 'dQw4w9WgXcQ')));
        $this->assertStringNotContainsString('Scribe-videoCaption', $this->render($this->video('youtube', 'dQw4w9WgXcQ', [], '  ')));
    }

    public function test_youtube_gets_its_thumbnail_and_vimeo_a_poster(): void
    {
        $this->assertStringContainsString('src="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"', $this->render($this->video('youtube', 'dQw4w9WgXcQ')));

        $vimeo = $this->render($this->video('vimeo', '76979871'));
        $this->assertStringNotContainsString('<img', $vimeo);
        $this->assertStringContainsString('Scribe-videoPoster', $vimeo);
    }

    public function test_a_3d_model_is_viewed_not_played(): void
    {
        $html = $this->render($this->video('sketchfab', '559b4fe0bf8342f3ae25370ffaa40d0a'));

        $this->assertStringContainsString('aria-label="View Sketchfab 3D model"', $html);
        $this->assertStringContainsString('View on Sketchfab', $html);
        $this->assertStringContainsString('Scribe-video--r16x9', $html);
        $this->assertStringNotContainsString('<img', $html);
        $this->assertStringNotContainsString('video', strtolower(strip_tags(str_replace(['Scribe-video', 'data-provider'], '', $html))));
    }

    public function test_vertical_formats_get_the_vertical_ratio(): void
    {
        $this->assertStringContainsString('Scribe-video--r9x16', $this->render($this->video('youtubeshorts', 'dQw4w9WgXcQ')));
        $this->assertStringContainsString('Scribe-video--r16x9', $this->render($this->video('youtube', 'dQw4w9WgXcQ')));
    }

    public static function rejected(): array
    {
        return [
            'unknown provider' => ['<video data-provider="evil" data-id="dQw4w9WgXcQ"></video>'],
            'no provider' => ['<video data-id="dQw4w9WgXcQ"></video>'],
            'no id' => ['<video data-provider="youtube"></video>'],
            'id too short' => ['<video data-provider="youtube" data-id="abc"></video>'],
            'another provider\'s id shape' => ['<video data-provider="youtube" data-id="0123456789abcdef0123456789abcdef"></video>'],
            'letters for vimeo' => ['<video data-provider="vimeo" data-id="dQw4w9WgXcQ"></video>'],
            'quote breakout' => ['<video data-provider="youtube" data-id="dQw4w9WgXc&quot; onerror=&quot;alert(1)"></video>'],
            'javascript id' => ['<video data-provider="youtube" data-id="javascript:alert(1)"></video>'],
            'url as id' => ['<video data-provider="youtube" data-id="https://evil.example/x"></video>'],
            'sketchfab upper-case id' => ['<video data-provider="sketchfab" data-id="559B4FE0BF8342F3AE25370FFAA40D0A"></video>'],
            'sketchfab url as id' => ['<video data-provider="sketchfab" data-id="https://evil.example/559b4fe0bf8342f3ae25370ffaa40d0a"></video>'],
            'path traversal' => ['<video data-provider="loom" data-id="../../../../evil"></video>'],
            'provider case trick' => ['<video data-provider="YouTube" data-id="dQw4w9WgXcQ"></video>'],
            'provider with suffix' => ['<video data-provider="youtube evil" data-id="dQw4w9WgXcQ"></video>'],
            'src attribute' => ['<video src="https://evil.example/x.mp4"></video>'],
            'raw iframe' => ['<iframe src="https://evil.example/"></iframe>'],
        ];
    }

    #[DataProvider('rejected')]
    public function test_a_bad_embed_never_becomes_a_video(string $input): void
    {
        $html = $this->render($input);

        // Whatever is left is TEXT: no element, no attribute a browser acts on.
        $this->assertStringNotContainsString('<figure', $html);
        $this->assertStringNotContainsString('<iframe', $html);
        $this->assertStringNotContainsString('<video', $html);
        $this->assertDoesNotMatchRegularExpression('/<(?!a\s)[a-z]+\s[^>]*(?:src|on[a-z]+)=/i', $html);
    }

    public function test_attributes_outside_the_vocabulary_are_dropped(): void
    {
        $html = $this->render('<video data-provider="youtube" data-id="dQw4w9WgXcQ" onclick="alert(1)" style="x" src="https://evil.example/" data-embed="https://evil.example/"></video>');

        $this->assertStringContainsString('data-id="dQw4w9WgXcQ"', $html);
        $this->assertStringNotContainsString('onclick', $html);
        $this->assertStringNotContainsString('evil.example', $html);
        $this->assertStringNotContainsString('style=', $html);
    }

    public function test_content_inside_the_element_is_only_ever_the_caption(): void
    {
        // The element's content is the caption: ordinary post text, so a link
        // in it is a link like any other in a post. It never reaches the
        // facade, the watch link or anything the player is built from.
        $html = $this->render('<video data-provider="youtube" data-id="dQw4w9WgXcQ"><a href="https://evil.example/">x</a></video>');
        $caption = '<span class="Scribe-videoCaption"><a href="https://evil.example/">x</a></span>';

        $this->assertStringContainsString($caption, $html);
        $this->assertStringNotContainsString('evil.example', str_replace($caption, '', $html));
    }

    public function test_a_start_time_that_is_not_a_number_is_dropped(): void
    {
        $html = $this->render($this->video('youtube', 'dQw4w9WgXcQ', ['start' => '5&quot;onload=x']));

        $this->assertStringContainsString('data-id="dQw4w9WgXcQ"', $html);
        $this->assertStringNotContainsString('data-start', $html);
        $this->assertStringNotContainsString('onload', $html);
    }

    public function test_the_caption_is_text_not_markup(): void
    {
        $html = $this->render($this->video('youtube', 'dQw4w9WgXcQ', [], '&lt;img src=x onerror=alert(1)&gt;'));

        $this->assertStringContainsString('&lt;img src=x onerror=alert(1)&gt;', $html);
        $this->assertStringNotContainsString('<img src=x', $html);
    }

    public function test_the_javascript_parser_compiles_with_the_tag_filter(): void
    {
        // Flarum compiles s9e's JS parser for its preview; a PHP-only tag
        // filter would make that compile fail for the whole forum.
        $this->assertStringContainsString('tag.invalidate()', self::$js);
    }
}
