<?php

namespace ErnestDefoe\Scribe\Tests\integration\api;

use Carbon\Carbon;
use Flarum\Discussion\Discussion;
use Flarum\Testing\integration\RetrievesAuthorizedUsers;
use Flarum\Testing\integration\TestCase;
use Flarum\User\User;
use PHPUnit\Framework\Attributes\Test;

class ScribeTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    protected function setUp(): void
    {
        parent::setUp();

        $this->extension('ernestdefoe-scribe');

        $users = [$this->normalUser()];
        foreach (range(3, 9) as $id) {
            $users[] = ['id' => $id, 'username' => "member$id", 'email' => "m$id@machine.local", 'password' => 'too-obscure', 'is_email_confirmed' => 1, 'joined_at' => Carbon::now()->subYear()];
        }

        $this->prepareDatabase([
            User::class => $users,
            Discussion::class => [
                ['id' => 1, 'title' => 'Downloads', 'created_at' => Carbon::now()->subDay(), 'user_id' => 3, 'first_post_id' => null, 'comment_count' => 0],
            ],
        ]);
    }

    private function forum(): array
    {
        return json_decode((string) $this->send($this->request('GET', '/api'))->getBody(), true)['data']['attributes'];
    }

    /** Post HTML as the editor would, and return the new post's id. */
    private function post(int $actor, string $html, int $discussion = 1): int
    {
        $response = $this->send($this->request('POST', '/api/posts', [
            'authenticatedAs' => $actor,
            'json' => ['data' => ['type' => 'posts', 'attributes' => ['content' => $html], 'relationships' => ['discussion' => ['data' => ['type' => 'discussions', 'id' => (string) $discussion]]]]],
        ]));
        $this->assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return (int) json_decode((string) $response->getBody(), true)['data']['id'];
    }

    private function html(int $post, ?int $actor = null): string
    {
        $response = $this->send($this->request('GET', "/api/posts/$post", $actor ? ['authenticatedAs' => $actor] : []));
        $this->assertSame(200, $response->getStatusCode());

        return json_decode((string) $response->getBody(), true)['data']['attributes']['contentHtml'];
    }

    #[Test]
    public function the_toolbar_reaches_the_forum_decoded_or_as_null()
    {
        $this->assertNull($this->forum()['scribeToolbar'], 'Never saved: the defaults apply');
    }

    #[Test]
    public function a_saved_toolbar_keeps_only_its_button_names()
    {
        $this->setting('ernestdefoe-scribe.toolbar', json_encode(['bold', 7, 'link', ['x']]));

        $this->assertSame(['bold', 'link'], $this->forum()['scribeToolbar']);
    }

    #[Test]
    public function a_corrupt_toolbar_falls_back_to_the_defaults()
    {
        $this->setting('ernestdefoe-scribe.toolbar', '{"bold"');

        $this->assertNull($this->forum()['scribeToolbar']);
    }

    #[Test]
    public function only_known_video_providers_can_be_switched_off()
    {
        $this->setting('ernestdefoe-scribe.video_providers_off', json_encode(['vimeo', 'evil.example', 3]));

        $forum = $this->forum();
        $this->assertTrue($forum['scribeVideoEmbeds']);
        $this->assertSame(['vimeo'], $forum['scribeVideoOff']);
    }

    #[Test]
    public function a_post_is_parsed_into_scribes_vocabulary_and_nothing_else()
    {
        $id = $this->post(3, '<p>Hello <strong>bold</strong> <a href="javascript:alert(1)">click</a></p><script>alert(2)</script><video data-provider="youtube" data-id="dQw4w9WgXcQ"></video>');

        $html = $this->html($id);
        $this->assertStringContainsString('<strong>bold</strong>', $html);
        $this->assertDoesNotMatchRegularExpression('/<a\b[^>]*href="javascript:/i', $html, 'A link Scribe cannot vouch for stays text');
        $this->assertStringNotContainsString('<script', $html);
        $this->assertStringContainsString('data-provider="youtube"', $html, 'A video arrives as a click-to-load facade');
        $this->assertStringNotContainsString('<iframe', $html);
    }

    #[Test]
    public function gated_content_is_only_sent_to_those_entitled_to_it()
    {
        $id = $this->post(3, '<p>Here it is.</p><section class="Scribe-replyGate"><p>The code is 4471</p></section>');

        $this->assertStringNotContainsString('4471', $this->html($id), 'A guest');
        $this->assertStringNotContainsString('4471', $this->html($id, 4), 'A member who has not replied');
        $this->assertStringContainsString('data-withheld', $this->html($id, 4), 'Told why');
        $this->assertStringContainsString('4471', $this->html($id, 3), 'The author');
        $this->assertStringContainsString('4471', $this->html($id, 1), 'An admin');

        $this->post(4, '<p>Thanks!</p>');
        $this->assertStringContainsString('4471', $this->html($id, 4), 'Once they have replied');
    }

    #[Test]
    public function a_page_of_gated_posts_asks_whether_the_reader_replied_once()
    {
        foreach (range(3, 9) as $author) {
            $this->post($author, "<section class=\"Scribe-replyGate\"><p>secret $author</p></section>");
        }

        // Seven gated posts by seven authors, read by someone who has not replied.
        $this->database()->enableQueryLog();
        $response = $this->send($this->request('GET', '/api/posts', ['authenticatedAs' => 2])->withQueryParams(['filter' => ['discussion' => '1']]));

        $this->assertSame(200, $response->getStatusCode());
        $this->assertStringNotContainsString('secret', (string) $response->getBody());

        $asked = array_filter($this->database()->getQueryLog(), fn ($q) => str_contains($q['query'], 'distinct') && str_contains($q['query'], 'discussion_id'));
        $this->assertCount(1, $asked, 'Asked once for the page, not once per post');
    }

    #[Test]
    public function entities_the_editor_writes_render_as_the_characters_they_stand_for()
    {
        /*
         * TipTap serialises `&` as `&amp;` and a non-breaking space as `&nbsp;`,
         * and text pasted from Word or WordPress is full of both (and of curly
         * quotes). Without flarum/markdown nothing decoded them, so a member
         * read "US &amp; UK" and "PARTNERS&nbsp;first" (Wil Vincent, 2026-10-10).
         */
        $id = $this->post(3, '<p>Their <strong>PARTNERS</strong>&nbsp;first. US &amp; UK &ldquo;quoted&rdquo; &#8217;s</p><h2>FBS US &amp; UK</h2>');
        $html = $this->html($id);

        $this->assertStringNotContainsString('&amp;nbsp;', $html);
        $this->assertStringNotContainsString('&amp;amp;', $html);
        $this->assertStringNotContainsString('&amp;ldquo;', $html);
        $this->assertStringNotContainsString('&amp;#8217;', $html);
        $this->assertStringContainsString('US &amp; UK', $html, 'An ampersand is one ampersand, escaped once for HTML');
        $this->assertStringContainsString("PARTNERS</strong>\u{00A0}first", $html);
        $this->assertStringContainsString("\u{201C}quoted\u{201D} \u{2019}s", $html);
    }

    #[Test]
    public function a_decoded_angle_bracket_stays_text()
    {
        // `&lt;script&gt;` is how the editor writes someone typing "<script>".
        // Decoded, it must still be text, never an element.
        $html = $this->html($this->post(3, '<p>&lt;script&gt;alert(1)&lt;/script&gt; and &lt;b&gt;</p>'));

        $this->assertStringNotContainsString('<script>', $html);
        $this->assertStringNotContainsString('<b>', $html);
        $this->assertStringContainsString('&lt;script&gt;alert(1)&lt;/script&gt;', $html);
    }

    #[Test]
    public function the_upgrade_repairs_posts_scribe_stored_with_literal_entities_and_leaves_others_alone()
    {
        // As the formatter stored them before it decoded entities.
        $scribe = '<r><P><s>&lt;p&gt;</s>US &amp;amp; UK&amp;nbsp;first<e>&lt;/p&gt;</e></P></r>';
        $markdown = '<r><p>Tom &amp;amp; Jerry, written in Markdown</p></r>';
        $this->app(); // the fixtures populate on boot, so insert after it
        $this->database()->table('posts')->insert([
            ['id' => 50, 'discussion_id' => 1, 'number' => 1, 'created_at' => Carbon::now(), 'user_id' => 3, 'type' => 'comment', 'content' => $scribe],
            ['id' => 51, 'discussion_id' => 1, 'number' => 2, 'created_at' => Carbon::now(), 'user_id' => 3, 'type' => 'comment', 'content' => $markdown],
        ]);

        $migration = require __DIR__.'/../../../migrations/2026_10_10_000000_decode_entities_in_scribe_posts.php';
        $migration['up']($this->database()->getSchemaBuilder());

        $formatter = $this->app()->getContainer()->make(\Flarum\Formatter\Formatter::class);
        $stored = (string) $this->database()->table('posts')->where('id', 50)->value('content');
        $this->assertStringContainsString("US &amp; UK\u{00A0}first", $formatter->render($stored), 'Rendered as one ampersand and a real non-breaking space');
        $this->assertSame($markdown, $this->database()->table('posts')->where('id', 51)->value('content'), 'A Markdown post is not reparsed');
        $this->assertNull($this->database()->table('posts')->where('id', 50)->value('edited_at'), 'The repair is not an edit');
    }
}

