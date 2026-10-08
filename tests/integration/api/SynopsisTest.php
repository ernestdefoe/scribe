<?php

namespace ErnestDefoe\Scribe\Tests\integration\api;

use Carbon\Carbon;
use Flarum\Testing\integration\RetrievesAuthorizedUsers;
use Flarum\Testing\integration\TestCase;
use Flarum\User\User;
use PHPUnit\Framework\Attributes\Test;

/**
 * fof/synopsis builds its excerpt from the stored XML, so the render-time gate
 * never sees it; Scribe has to withhold gated text from the excerpt too.
 */
class SynopsisTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    protected function setUp(): void
    {
        parent::setUp();

        $this->extension('flarum-tags', 'fof-synopsis', 'ernestdefoe-scribe');

        $users = [$this->normalUser()];
        foreach (range(3, 9) as $id) {
            $users[] = ['id' => $id, 'username' => "member$id", 'email' => "m$id@machine.local", 'password' => 'too-obscure', 'is_email_confirmed' => 1, 'joined_at' => Carbon::now()->subYear()];
        }

        $this->prepareDatabase([
            User::class => $users,
            // Untagged discussions, so starting one needs no tag fixtures.
            'group_permission' => [['group_id' => 3, 'permission' => 'bypassTagCounts']],
        ]);
    }

    /**
     * fof/synopsis reads its tag settings once per discussion; that is its
     * query, not Scribe's.
     */
    protected function allowedRepeatedQueries(): array
    {
        return ['excerpt_length'];
    }

    /** @return int the new discussion's id */
    private function start(int $actor, string $html): int
    {
        $response = $this->send($this->request('POST', '/api/discussions', [
            'authenticatedAs' => $actor,
            'json' => ['data' => ['type' => 'discussions', 'attributes' => ['title' => "Thread by $actor", 'content' => $html]]],
        ]));
        $this->assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return (int) json_decode((string) $response->getBody(), true)['data']['id'];
    }

    /** @return array<int, string|null> excerpts by discussion id */
    private function excerpts(?int $actor): array
    {
        $response = $this->send($this->request('GET', '/api/discussions', $actor ? ['authenticatedAs' => $actor] : []));
        $this->assertSame(200, $response->getStatusCode());

        $out = [];
        foreach (json_decode((string) $response->getBody(), true)['data'] as $row) {
            $out[(int) $row['id']] = $row['attributes']['synopsisExcerpt'] ?? null;
        }

        return $out;
    }

    #[Test]
    public function the_discussion_list_never_shows_gated_text_to_someone_not_entitled()
    {
        $ids = [];
        foreach (range(3, 9) as $author) {
            $ids[$author] = $this->start($author, "<p>Open words $author.</p><section class=\"Scribe-replyGate\"><p>hidden $author</p></section>");
        }

        // Seven gated excerpts on one page: flarum/testing also fails the
        // request if "has this reader replied" were asked once per row.
        $asGuest = $this->excerpts(null);
        $this->assertStringContainsString('Open words 3.', (string) $asGuest[$ids[3]]);
        $this->assertStringNotContainsString('hidden', implode(' ', array_filter($asGuest)));

        $asAuthor = $this->excerpts(3);
        $this->assertStringContainsString('hidden 3', (string) $asAuthor[$ids[3]], 'The author of the thread');
        $this->assertStringNotContainsString('hidden 4', (string) $asAuthor[$ids[4]]);
    }
}
