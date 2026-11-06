<?php

namespace ErnestDefoe\Scribe\Formatter;

use s9e\TextFormatter\Configurator;
use s9e\TextFormatter\Configurator\Items\AttributeFilters\RegexpFilter;
use s9e\TextFormatter\Parser\Tag;
use s9e\TextFormatter\Plugins\HTMLElements\Configurator as HTMLElements;

/**
 * Video embeds: one tag, SCRIBEVIDEO, built from resources/video-providers.json.
 *
 * The editor stores `<video data-provider="youtube" data-id="…" data-start="42">
 * caption</video>`. Only the provider KEY and the ID are kept, never a URL:
 * every URL a reader's browser is ever sent to (the link, the thumbnail, the
 * player) is rebuilt here, or in the forum's click handler, from the
 * registry's templates and an id that has passed this provider's own pattern.
 *
 * 🚨 Three checks, and the third is the one that matters:
 *
 *   1. `provider` must be one of the registry's keys.
 *   2. `id` must match the union of every provider's id pattern. On its own
 *      that already keeps quotes, slashes and `javascript:` out of everything.
 *   3. A TAG filter checks the pair: the id must match THIS provider's pattern.
 *      An attribute filter only ever sees its own value, so without this a
 *      Loom-shaped id under `youtube` would pass both of the above.
 *
 * A tag that fails any of them is dropped at parse time; the post saves without
 * it. There is no "unsafe but stored" state.
 *
 * 🚨 The rendered HTML is a FACADE, not a player: a link to the video, with the
 * thumbnail where one exists without an API call. s9e's template checker refuses
 * <iframe> in a template outright, and that suits the design anyway: nothing is
 * requested from the provider until the reader clicks, and with JavaScript off
 * the facade is simply a link. js/src/forum/videoEmbeds.ts swaps in the player.
 */
class VideoEmbed
{
    public const TAG = 'SCRIBEVIDEO';

    /** The element the editor emits. `figure` is SCRIBEIMGALIGN's and `embed` is Ruffle's. */
    public const ELEMENT = 'video';

    private const REGISTRY = __DIR__.'/../../resources/video-providers.json';

    private static ?array $providers = null;

    /** key => provider definition, in registry order. */
    public static function providers(): array
    {
        if (self::$providers === null) {
            $json = json_decode((string) file_get_contents(self::REGISTRY), true);
            self::$providers = is_array($json['providers'] ?? null) ? $json['providers'] : [];
        }

        return self::$providers;
    }

    /** The anchored, exact pattern for one provider's ids. */
    public static function idPattern(string $provider): ?string
    {
        $definition = self::providers()[$provider] ?? null;

        return $definition ? '/^(?:'.$definition['id'].')$/D' : null;
    }

    /**
     * The tag filter (check 3 above). Runs after the attribute filters, so both
     * values are already known to be well-formed; this decides whether they
     * belong together.
     *
     * 🚨 It must INVALIDATE the tag, not return false. s9e ignores a tag
     * filter's return value entirely (FilterProcessing::filterTag), so a filter
     * written as a predicate passes everything — which is exactly what the
     * first version of this did, and a 32-character id sailed through under
     * `youtube` until a test tried one.
     */
    public static function filterTag(Tag $tag): bool
    {
        $pattern = self::idPattern((string) $tag->getAttribute('provider'));
        $valid = $pattern !== null && preg_match($pattern, (string) $tag->getAttribute('id')) === 1;

        if (! $valid) {
            $tag->invalidate();
        }

        return $valid;
    }

    /**
     * @param callable(string $key, string $fallback, array $params): string $translate
     */
    public function configure(Configurator $config, HTMLElements $plugin, callable $translate): void
    {
        // Another extension owning the name keeps it; see Configure::registerTags.
        if ($config->tags->exists(self::TAG) || self::providers() === []) {
            return;
        }

        $providers = self::providers();
        $tag = $config->tags->add(self::TAG);

        $provider = $tag->attributes->add('provider');
        $provider->required = true;
        $provider->filterChain->append(new RegexpFilter(
            '/^(?:'.implode('|', array_map(fn ($k) => preg_quote($k, '/'), array_keys($providers))).')$/D'
        ));

        $id = $tag->attributes->add('id');
        $id->required = true;
        $id->filterChain->append(new RegexpFilter(
            '/^(?:'.implode('|', array_unique(array_column($providers, 'id'))).')$/D'
        ));

        $start = $tag->attributes->add('start');
        $start->required = false;
        $start->filterChain->append('#uint');

        /*
         * 🚨 The caption is the element's CONTENT, not an attribute.
         *
         * It started as `data-caption`, and every plugin Flarum runs over the
         * raw text reached inside the start tag: Autolink took a URL in the
         * caption, HTMLEntities took any `&#…;`, emoji took `:smile:`. Each one
         * claimed a piece of the start tag, s9e tore the tag apart, and the post
         * rendered the video followed by a literal `</video>`. Encoding the
         * caption only moved the problem to HTMLEntities. As content it is just
         * post text: autolinked, emoji'd and mentioned like any other, and the
         * start tag holds nothing but an enum, an id and a number, none of which
         * any plugin can match.
         */

        $tag->filterChain
            ->append([self::class, 'filterTag'])
            ->setJS($this->jsTagFilter($providers));

        $tag->template = $this->template($providers, $translate);

        $plugin->aliasElement(self::ELEMENT, self::TAG);
        foreach (['provider', 'id', 'start'] as $attribute) {
            $plugin->aliasAttribute(self::ELEMENT, 'data-'.$attribute, $attribute);
        }
    }

    /**
     * Flarum compiles a JavaScript copy of the parser for its composer preview,
     * and s9e will not compile a PHP callback without a JS twin. Same check,
     * same patterns.
     */
    private function jsTagFilter(array $providers): string
    {
        $patterns = [];
        foreach ($providers as $key => $definition) {
            $patterns[] = json_encode($key).':/^(?:'.str_replace('/', '\\/', $definition['id']).')$/';
        }

        return 'function(tag){var r={'.implode(',', $patterns).'},p=tag.getAttribute("provider");'
            .'if(!(Object.prototype.hasOwnProperty.call(r,p)&&r[p].test(tag.getAttribute("id")))){tag.invalidate();return false}return true}';
    }

    private function template(array $providers, callable $translate): string
    {
        $branches = '';

        foreach ($providers as $key => $p) {
            $brand = $p['brand'] ?? $p['name'];
            $ratio = 'Scribe-video--r'.str_replace(':', 'x', $p['aspect'] ?? '16:9');
            $icon = $this->xml($p['icon'] ?? 'fas fa-video');
            $watch = $this->url($p['watch'], $p['watchStart'] ?? null);
            // An attribute value in a template is an AVT: a brace in a translation would be read as an expression.
            // A 3D model is viewed, not played.
            [$playKey, $playText, $watchKey, $watchText] = ($p['kind'] ?? null) === 'model'
                ? ['play_model', 'View {provider} 3D model', 'view_on', 'View on {provider}']
                : ['play', 'Play {provider} video', 'watch_on', 'Watch on {provider}'];
            $play = $this->avt($translate('ernestdefoe-scribe.forum.video.'.$playKey, $playText, ['provider' => $brand]));
            $watchLabel = $this->xml($translate('ernestdefoe-scribe.forum.video.'.$watchKey, $watchText, ['provider' => $brand]));
            $k = $this->xml($key);

            $visual = isset($p['thumbnail'])
                ? '<img class="Scribe-videoThumb" alt="" loading="lazy" referrerpolicy="no-referrer"><xsl:attribute name="src">'.$this->url($p['thumbnail'], null).'</xsl:attribute></img>'
                : '<span class="Scribe-videoPoster"><i class="icon '.$icon.'" aria-hidden="true"></i><span class="Scribe-videoBrand">'.$this->xml($brand).'</span></span>';

            $branches .= '<xsl:when test="@provider=\''.$k.'\'">'
                .'<figure class="Scribe-video '.$ratio.'" data-provider="'.$k.'" data-id="{@id}">'
                .'<xsl:if test="@start"><xsl:attribute name="data-start"><xsl:value-of select="@start"/></xsl:attribute></xsl:if>'
                .'<a class="Scribe-videoFacade" target="_blank" rel="nofollow noopener ugc" aria-label="'.$play.'">'
                .'<xsl:attribute name="href">'.$watch.'</xsl:attribute>'
                .$visual
                .'<span class="Scribe-videoPlay" aria-hidden="true"></span>'
                .'</a>'
                .'<figcaption class="Scribe-videoBar">'
                // Only a caption that has something in it; <s>/<e> are s9e's
                // record of the source markup, not content.
                .'<xsl:if test="text()[normalize-space()] or *[not(self::s or self::e or self::i)]"><span class="Scribe-videoCaption"><xsl:apply-templates/></span></xsl:if>'
                .'<a class="Scribe-videoWatch" target="_blank" rel="nofollow noopener ugc">'
                .'<xsl:attribute name="href">'.$watch.'</xsl:attribute>'
                .'<i class="icon '.$icon.'" aria-hidden="true"></i> <span class="Scribe-videoWatchText">'.$watchLabel.'</span>'
                .'</a>'
                .'</figcaption>'
                .'</figure>'
                .'</xsl:when>';
        }

        return '<xsl:choose>'.$branches.'</xsl:choose>';
    }

    /**
     * A registry URL template as XSL: static text escaped, {id} and the start
     * placeholders read from the (already validated) attributes, and the
     * start suffix only when the post has a start time.
     */
    private function url(string $template, ?string $startSuffix): string
    {
        $xsl = $this->interpolate($template);

        if ($startSuffix !== null) {
            $xsl .= '<xsl:if test="@start">'.$this->interpolate($startSuffix).'</xsl:if>';
        }

        return $xsl;
    }

    private function interpolate(string $template): string
    {
        $parts = preg_split('/(\{id\}|\{start\}|\{startHms\})/', $template, -1, PREG_SPLIT_DELIM_CAPTURE);
        $out = '';

        foreach ($parts as $part) {
            $out .= match ($part) {
                '{id}' => '<xsl:value-of select="@id"/>',
                '{start}' => '<xsl:value-of select="@start"/>',
                '{startHms}' => '<xsl:value-of select="concat(floor(@start div 3600),\'h\',floor((@start mod 3600) div 60),\'m\',@start mod 60,\'s\')"/>',
                default => $part === '' ? '' : '<xsl:text>'.$this->xml($part).'</xsl:text>',
            };
        }

        return $out;
    }

    private function avt(string $value): string
    {
        return str_replace(['{', '}'], ['{{', '}}'], $this->xml($value));
    }

    private function xml(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_XML1, 'UTF-8');
    }
}
