<?php

namespace ErnestDefoe\Scribe\Formatter;

use DOMDocument;
use DOMElement;
use Flarum\Discussion\Discussion;
use Flarum\Http\RequestUtil;
use Flarum\Post\Post;
use Flarum\User\User;
use Psr\Http\Message\ServerRequestInterface;
use s9e\TextFormatter\Renderer;
use WeakMap;

/**
 * Keeps "reply to view" content out of the HTML for anyone not entitled to it.
 *
 * 🚨 This used to be CSS and JS only: the gated text was in every rendered
 * post, so the API, the page source, crawlers and guests all had it. An author
 * who gated a download link or an answer behind a reply was publishing it.
 *
 * Now the block's children are removed from the XML before it is rendered,
 * unless the viewer wrote the post, moderates the discussion, or has a comment
 * in it. With no request at all (a notification email, a meta description
 * built in the background) nobody is known to be entitled, so it is withheld.
 * The block itself stays, marked `data-withheld`, so the reader still sees the
 * "reply to see this" message, and the forum's JS knows to fetch the post
 * again once they have replied (see js/src/forum/replyGate.ts).
 *
 * Cheap where it does not apply: a post without a gate is a substring check,
 * and the "has this member replied here" question is asked once per
 * discussion per request, however many gated posts the page holds.
 */
class ReplyGate
{
    /**
     * Per request: discussions whose answer is wanted soon (`pending`), and the
     * answers already known (`replied`, `moderates`).
     *
     * @var WeakMap<ServerRequestInterface, array{pending: array<int, true>, replied: array<int, bool>, moderates: array<int, bool>}>|null
     */
    private static ?WeakMap $known = null;

    public function __invoke(Renderer $renderer, mixed $context, string $xml, ?ServerRequestInterface $request = null): string
    {
        if (! str_contains($xml, '<SCRIBEREPLY')) {
            return $xml;
        }

        // Only a post has a discussion to reply to. Anywhere else the block is
        // left as it always was.
        if (! $context instanceof Post || ! $context->discussion_id) {
            return $xml;
        }

        if ($request !== null && self::entitled(RequestUtil::getActor($request), $context, $request)) {
            return $xml;
        }

        return self::withhold($xml);
    }

    /**
     * Say that this request will ask about a discussion, so the "has replied"
     * lookup that follows covers it in the same query as the rest.
     */
    public static function expect(ServerRequestInterface $request, int $discussionId): void
    {
        self::$known ??= new WeakMap();
        $known = self::$known[$request] ?? ['pending' => [], 'replied' => [], 'moderates' => []];
        $known['pending'][$discussionId] = true;
        self::$known[$request] = $known;
    }

    /**
     * May this actor see the gated content of this post? The author, admins,
     * anyone who can edit posts in the discussion, and anyone with a visible
     * comment in it. One query per request answers every discussion expected
     * so far; never one per post.
     */
    public static function entitled(User $actor, Post $post, ServerRequestInterface $request, ?Discussion $discussion = null): bool
    {
        if ($actor->isGuest()) {
            return false;
        }

        if ((int) $post->user_id === (int) $actor->id || $actor->isAdmin()) {
            return true;
        }

        self::$known ??= new WeakMap();
        $known = self::$known[$request] ?? ['pending' => [], 'replied' => [], 'moderates' => []];
        $discussionId = (int) $post->discussion_id;

        if (! array_key_exists($discussionId, $known['moderates'])) {
            $discussion ??= $post->discussion;
            $known['moderates'][$discussionId] = $discussion && $actor->can('editPosts', $discussion);
        }

        if (! $known['moderates'][$discussionId] && ! array_key_exists($discussionId, $known['replied'])) {
            $ask = array_keys(array_diff_key($known['pending'] + [$discussionId => true], $known['replied']));
            $replied = Post::query()
                ->whereIn('discussion_id', $ask)
                ->where('user_id', $actor->id)
                ->where('type', 'comment')
                ->whereNull('hidden_at')
                ->distinct()
                ->pluck('discussion_id')
                ->all();

            $known['replied'] += array_fill_keys($ask, false);
            foreach ($replied as $id) {
                $known['replied'][(int) $id] = true;
            }
            $known['pending'] = [];
        }

        self::$known[$request] = $known;

        return $known['moderates'][$discussionId] || $known['replied'][$discussionId];
    }

    /**
     * The same XML with every reply gate emptied and marked as withheld.
     * Pure, so it is tested against the real formatter.
     */
    public static function withhold(string $xml): string
    {
        $doc = new DOMDocument();

        if (! @$doc->loadXML($xml, LIBXML_NONET)) {
            // Unreadable XML cannot be trimmed safely; render none of it.
            return '<t></t>';
        }

        $gates = [];
        foreach ($doc->getElementsByTagName('SCRIBEREPLY') as $gate) {
            $gates[] = $gate;
        }

        foreach ($gates as $gate) {
            /** @var DOMElement $gate */
            if (! $gate->parentNode) {
                continue; // inside a gate already emptied
            }

            while ($gate->firstChild) {
                $gate->removeChild($gate->firstChild);
            }

            $gate->setAttribute('withheld', '1');
        }

        // 🚨 Never <SCRIBEREPLY/>: s9e's renderer does not take a self-closing
        // tag as closed and swallowed the rest of the post after it.
        return (string) $doc->saveXML($doc->documentElement, LIBXML_NOEMPTYTAG);
    }
}
