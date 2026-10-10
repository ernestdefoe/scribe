<?php

/*
 * Repair posts written before Scribe decoded HTML entities.
 *
 * Until 2026-10-10 Scribe's formatter parsed the HTML the editor submits but
 * not its entities, so `&amp;`, `&nbsp;`, `&lt;` and pasted curly quotes were
 * stored as literal text and shown as written (Wil Vincent). The formatter
 * now decodes them; this reparses the posts that were saved before it did.
 *
 * Only posts Scribe wrote, recognisable by the HTML element markers it leaves
 * in the stored XML, and only those with a literal entity left in their text.
 * A post written in Markdown is never touched: reparsing it on a forum that
 * has since turned Markdown off would strip its formatting.
 */

use Flarum\Formatter\Formatter;
use Flarum\Post\CommentPost;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        /** @var Formatter $formatter */
        $formatter = resolve(Formatter::class);

        // The cached parser predates this release; rebuild it with entity decoding.
        $formatter->flush();

        $db = $schema->getConnection();
        $scribeMarkup = '/<s>&lt;(?:p|h[1-6]|li|ul|ol|strong|em|code|pre|blockquote|a)[ &]/';
        $literalEntity = '/&amp;(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#[0-9]{1,7}|#x[0-9a-fA-F]{1,6});/';

        CommentPost::query()
            ->where('type', 'comment')
            ->where('content', 'like', '%&amp;%')
            ->select(['id', 'discussion_id', 'user_id', 'type', 'content'])
            ->chunkById(200, function ($posts) use ($formatter, $db, $scribeMarkup, $literalEntity) {
                foreach ($posts as $post) {
                    $xml = (string) $post->getRawOriginal('content');

                    if (! preg_match($scribeMarkup, $xml) || ! preg_match($literalEntity, $xml)) {
                        continue;
                    }

                    $reparsed = $formatter->parse((string) $formatter->unparse($xml, $post), $post);

                    if ($reparsed !== $xml) {
                        // The query builder, not save(): no edit stamp, no events, nothing re-notified.
                        $db->table('posts')->where('id', $post->id)->update(['content' => $reparsed]);
                    }
                }
            });
    },

    'down' => function () {
        // Nothing to undo: the reparsed posts are what their authors wrote.
    },
];
