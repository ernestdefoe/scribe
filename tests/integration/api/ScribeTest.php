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
}
