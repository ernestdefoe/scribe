<?php

/*
 * Scribe — a true WYSIWYG editor for Flarum.
 *
 * Deliberately does NOT depend on flarum/markdown. See src/Formatter/Vocabulary.
 */

use ErnestDefoe\Scribe\Api\SynopsisExcerpt;
use ErnestDefoe\Scribe\Formatter\BareDiscordLinks;
use ErnestDefoe\Scribe\Formatter\Configure;
use ErnestDefoe\Scribe\Formatter\ReplyGate;
use ErnestDefoe\Scribe\Formatter\VideoEmbed;
use Flarum\Api\Resource\DiscussionResource;
use Flarum\Extend;
use Flarum\Extension\ExtensionManager;

return [
    /*
     * The EDITOR stands down when another editor stack is enabled. The FORMATTER
     * never does.
     *
     * 🚨 flarum/markdown is in that list, and it is the one that matters. It
     * ESCAPES raw HTML - that is its correct behaviour - and Scribe stores posts
     * AS HTML. Leave both enabled and Scribe writes a post that markdown renders
     * as visible `&lt;p&gt;`, with no error anywhere. fof/rich-text drags the
     * same problem in through the back door, because it *requires*
     * flarum/markdown: enabling it makes Flarum switch markdown back on.
     *
     * The formatter stays registered either way, because it renders posts that
     * are ALREADY WRITTEN. Pull it and every spoiler, table and coloured span on
     * the forum becomes stripped-out nothing. A reader must never lose content
     * because an admin turned on a different editor.
     *
     * This replaces a hard `conflict` in composer.json, which made Scribe
     * impossible to even try: you had to uninstall your current editor first,
     * blind, before Composer would let you see whether you liked this one.
     */
    (new Extend\Conditional())
        ->when(
            fn (ExtensionManager $extensions) => ! $extensions->isEnabled('flarum-markdown')
                && ! $extensions->isEnabled('fof-rich-text'),
            fn () => [
                (new Extend\Frontend('forum'))
                    ->js(__DIR__.'/js/dist/forum.js')
                    ->jsDirectory(__DIR__.'/js/dist/forum'),

                (new Extend\Frontend('admin'))
                    ->js(__DIR__.'/js/dist/admin.js'),
            ]
        ),

    /*
     * Stylesheets load unconditionally, because they style POSTS, not the
     * editor. A spoiler written last year still has to look like a spoiler on a
     * forum that has since switched editors.
     *
     * 🚨 The jsDirectory above is not optional. TipTap is a dynamic import so it
     * stays out of forum.js - ~430KB every visitor would otherwise download on
     * every page, guests included. Flarum does not publish an extension's chunk
     * files unless the directory holding them is declared; without it the
     * browser requests the chunk, gets a 404, and the editor never mounts, with
     * no server-side error to find.
     */
    (new Extend\Frontend('forum'))
        ->css(__DIR__.'/less/forum.less'),

    (new Extend\Frontend('admin'))
        ->css(__DIR__.'/less/admin.less'),

    (new Extend\Formatter)
        ->configure(Configure::class)
        ->parse(BareDiscordLinks::class)
        // "Reply to view" content leaves the server only for viewers entitled to it.
        ->render(ReplyGate::class),

    /*
     * fof/synopsis builds its discussion-list excerpt from the stored XML, so
     * the render callback above never runs on it. This keeps gated content out
     * of the excerpt too. fof-synopsis is an optional dependency in
     * composer.json so this field mutator runs AFTER Synopsis adds the field;
     * booted first, it would mutate nothing.
     */
    (new Extend\Conditional())
        ->whenExtensionEnabled('fof-synopsis', fn () => [
            (new Extend\ApiResource(DiscussionResource::class))
                ->field('synopsisExcerpt', SynopsisExcerpt::class),
        ]),

    /*
     * Which buttons the toolbar shows, in order, as chosen in the AdminCP.
     *
     * Sent to the forum so the composer can build its toolbar on first paint
     * without an extra request. Decoded here rather than in JS so a corrupt or
     * hand-edited value fails to a null the client reads as "use the defaults",
     * instead of throwing inside the composer and leaving no editor at all.
     */
    (new Extend\Settings)
        ->serializeToForum('scribeToolbar', 'ernestdefoe-scribe.toolbar', function ($value) {
            $decoded = json_decode((string) $value, true);

            return is_array($decoded) && $decoded !== [] ? array_values(array_filter($decoded, 'is_string')) : null;
        })
        /*
         * Video embeds. These decide what the EDITOR does with a pasted link and
         * whether a click loads the player in the page; they never change how a
         * stored post parses, so flipping them needs no formatter rebuild and
         * leaves every existing post exactly as it was. With embeds off, or a
         * provider off, the facade is simply the link it already is.
         */
        ->default('ernestdefoe-scribe.video_embeds', true)
        ->default('ernestdefoe-scribe.video_providers_off', '[]')
        ->serializeToForum('scribeVideoEmbeds', 'ernestdefoe-scribe.video_embeds', fn ($value) => (bool) $value)
        ->serializeToForum('scribeVideoOff', 'ernestdefoe-scribe.video_providers_off', function ($value) {
            $decoded = json_decode((string) $value, true);

            return is_array($decoded)
                ? array_values(array_intersect(array_keys(VideoEmbed::providers()), array_filter($decoded, 'is_string')))
                : [];
        }),

    new Extend\Locales(__DIR__.'/locale'),
];
