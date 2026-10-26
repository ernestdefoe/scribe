<?php

namespace ErnestDefoe\Scribe\Formatter;

use s9e\TextFormatter\Renderer;

/**
 * Shows `<?php` in a code block written as HTML, not `&lt;?php`.
 *
 * 🚨 The editor stores a code block as `<pre data-lang="php">&lt;?php …</pre>`,
 * escaped, as HTML has to be. Everywhere else HTMLEntities decodes that, but
 * s9e's IgnoreTagsInCode rule keeps every tag - entities included - out of
 * any tag whose template holds a <code>, so CODE and C keep the entities as
 * TEXT and readers saw "&lt;?php" and "&amp;".
 *
 * Decoded here, at render, rather than at parse:
 * - the stored source stays escaped, which the editor needs: a raw `<?php`
 *   reloaded into TipTap is read as an HTML comment and vanishes;
 * - a decoded `</pre>` or `</code>` inside the code cannot close the block
 *   early, because the parser never sees it;
 * - every post already written is fixed with no repair to run.
 *
 * Only blocks that came from HTML are touched - their start marker is `<pre`
 * or `<code`. A Markdown or BBCode block is literal by definition: "&lt;"
 * typed between backticks is meant to read "&lt;".
 */
class DecodeEntitiesInCode
{
    public function __invoke(Renderer $renderer, mixed $context, string $xml): string
    {
        if (! str_contains($xml, '<s>&lt;pre') && ! str_contains($xml, '<s>&lt;code')) {
            return $xml;
        }

        return self::apply($xml);
    }

    public static function apply(string $xml): string
    {
        return preg_replace_callback(
            '~(<(?:C|CODE)\b[^>]*><s>&lt;(?:pre|code)\b[^<]*</s>)([^<]*)(?=<e>)~',
            function (array $m) {
                if (! str_contains($m[2], '&amp;')) {
                    return $m[0];
                }

                $text = html_entity_decode(htmlspecialchars_decode($m[2], ENT_QUOTES | ENT_XML1), ENT_QUOTES | ENT_HTML5, 'UTF-8');

                return $m[1].htmlspecialchars($text, ENT_NOQUOTES | ENT_XML1, 'UTF-8');
            },
            $xml
        ) ?? $xml;
    }
}
