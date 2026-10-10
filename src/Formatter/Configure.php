<?php

namespace ErnestDefoe\Scribe\Formatter;

use Flarum\Locale\TranslatorInterface;
use s9e\TextFormatter\Configurator;
use s9e\TextFormatter\Configurator\Items\AttributeFilters\RegexpFilter;
use s9e\TextFormatter\Plugins\HTMLElements\Configurator as HTMLElementsConfigurator;

/**
 * Teaches the formatter to read the HTML the editor produces, and to keep
 * rendering the posts written before it existed.
 *
 * The whole design rests on one property of s9e: the *tag* vocabulary is
 * independent of the *syntax* that produced it. Markdown was only ever one
 * parser feeding those tags. Swap the parser for an HTML one and every post,
 * old and new, still renders through a single set of templates.
 */
class Configure
{
    /** Used when the translator is unreachable or has nothing for the key. */
    private const LOCKED_FALLBACK = 'You need to reply to this discussion before you can see this.';

    public function __invoke(Configurator $config): void
    {
        $this->registerTags($config, Vocabulary::TEMPLATES, Vocabulary::ATTRIBUTES);
        $this->registerTags($config, $this->resolveTokens(Vocabulary::EXTRA_TEMPLATES), Vocabulary::ATTRIBUTES);

        $plugin = $config->plugins->load('HTMLElements');
        if (! $plugin instanceof HTMLElementsConfigurator) {
            throw new \LogicException('s9e loaded something other than its HTMLElements plugin.');
        }

        foreach (Vocabulary::ELEMENTS + Vocabulary::EXTRA_ELEMENTS as $element => $tag) {
            // A tag we skipped because nothing registered it (and nobody else
            // did either) must not be aliased, or the parser produces a tag the
            // renderer has no template for — which renders as nothing at all.
            if (! $config->tags->exists($tag)) {
                continue;
            }

            $plugin->aliasElement($element, $tag);

            foreach (Vocabulary::ATTRIBUTES[$tag] ?? [] as $attribute => $filter) {
                $plugin->aliasAttribute($element, Vocabulary::SOURCE_ATTRIBUTES[$attribute] ?? $attribute, $attribute);
            }
        }

        /*
         * <p> and <br> stay themselves. s9e renders a lowercase element in the
         * stored XML literally, which is exactly why paragraphs in existing
         * posts survive flarum/markdown being removed while <STRONG> would not.
         */
        foreach (Vocabulary::PASSTHROUGH as $element) {
            $plugin->allowElement($element);
        }

        /*
         * 🚨 Decode entities in the TEXT, or they are shown as written.
         *
         * Scribe stores HTML, and TipTap serialises `&` as `&amp;`, a
         * non-breaking space as `&nbsp;` and `<` typed as text as `&lt;`; text
         * pasted from Word or WordPress adds curly quotes on top. HTMLElements
         * only decodes attribute values, and flarum/markdown, which decoded the
         * rest, is off wherever this editor runs. So a member read
         * "US &amp; UK" and "PARTNERS&nbsp;first" (Wil Vincent, 2026-10-10).
         *
         * A decoded `&lt;` becomes the CHARACTER `<`, which is escaped again
         * when rendered: it can never open an element.
         */
        if (! isset($config->HTMLEntities)) {
            $config->plugins->load('HTMLEntities');
        }

        /*
         * Video embeds are built from a registry rather than listed in
         * Vocabulary, because each provider brings its own id pattern and its
         * own URLs. See VideoEmbed.
         */
        (new VideoEmbed())->configure($config, $plugin, fn (string $key, string $fallback, array $params) => $this->translate($key, $fallback, $params));
    }

    /**
     * Fill in the strings a compiled XSL template cannot ask for itself.
     *
     * Resolved against the forum's DEFAULT locale, because the formatter is
     * compiled once and cached for everyone - there is no viewer at this point
     * to have a language. The frontend replaces it per viewer where it can; see
     * js/src/forum/replyGate.ts.
     *
     * Escaped as XML because the result is spliced into a template, and a
     * translator who writes an apostrophe or an ampersand must not be able to
     * produce one that fails to compile.
     */
    private function resolveTokens(array $templates): array
    {
        $replacements = [
            '%scribe.replyGateLocked%' => $this->xml(
                $this->translate('ernestdefoe-scribe.forum.reply_gate.locked', self::LOCKED_FALLBACK)
            ),
        ];

        foreach ($templates as $name => $template) {
            $templates[$name] = strtr($template, $replacements);
        }

        return $templates;
    }

    /**
     * A translation, or the English default if the translator cannot be reached.
     *
     * 🚨 This runs while the formatter is being COMPILED, which happens inside
     * a cache miss on an ordinary page render. An exception escaping here does
     * not degrade one feature - it takes down every page that renders a post.
     * A missing translator is not worth that, so it falls back.
     */
    private function translate(string $key, string $fallback, array $params = []): string
    {
        $fallback = strtr($fallback, array_combine(
            array_map(fn ($name) => '{'.$name.'}', array_keys($params)),
            array_values($params)
        ));

        try {
            $translated = resolve(TranslatorInterface::class)->trans($key, $params);
        } catch (\Throwable $e) {
            return $fallback;
        }

        // Flarum hands back the key itself when nothing is registered for it,
        // which would put "ernestdefoe-scribe.forum..." in front of readers.
        return ($translated === '' || $translated === $key) ? $fallback : $translated;
    }

    /** Safe to splice into an XSL template, whatever the translator wrote. */
    private function xml(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_XML1, 'UTF-8');
    }

    /**
     * Registers a tag only if nothing has claimed the name yet.
     *
     * 🚨 Never overwrite an existing template. flarum/bbcode owns CODE, DEL,
     * EMAIL, IMG, LI, LIST, QUOTE and URL when enabled, and its versions carry
     * things ours do not — syntax highlighting on CODE, the `uncited` class and
     * author citation on QUOTE. Clobbering those would silently strip
     * highlighting from every code block on the forum, which is precisely the
     * class of failure this extension exists to avoid.
     */
    private function registerTags(Configurator $config, array $templates, array $attributes): void
    {
        foreach ($templates as $name => $template) {
            if ($config->tags->exists($name)) {
                continue;
            }

            $tag = $config->tags->add($name);

            foreach ($attributes[$name] ?? [] as $attribute => $filter) {
                $attr = $tag->attributes->add($attribute);
                $attr->required = false;
                // The filter is the security boundary, not the template. An
                // unfiltered value interpolated into a style or href is stored
                // XSS; #color/#url/#uint reject the value outright instead.
                $attr->filterChain->append($this->resolveFilter($filter));
            }

            $tag->template = $template;
        }
    }

    /**
     * `#title` isn't an s9e built-in — Spoiler/Info titles need Unicode
     * letters (Turkish included) and emoji, both of which a narrow allow-list
     * rejects outright. s9e's filter chain is all-or-nothing: one
     * disallowed character fails the WHOLE attribute, not just that
     * character, so an emoji-prefixed title didn't lose the emoji — it lost
     * the entire title. Safe with a deny-list instead of an allow-list
     * because the value is only ever placed via xsl:value-of into a text
     * node (auto-escaped), never interpolated into an attribute or style —
     * it doesn't need #simpletext's CSS-safety guarantee, just no control
     * characters and a sane length cap.
     */
    private function resolveFilter(string $filter): string|RegexpFilter
    {
        if ($filter === '#title') {
            return new RegexpFilter('/^[^\x00-\x1F\x7F]{1,80}$/Du');
        }

        return $filter;
    }
}
