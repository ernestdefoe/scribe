<?php

namespace ErnestDefoe\Scribe\Tests\Formatter;

use ErnestDefoe\Scribe\Formatter\BareDiscordLinks;
use Flarum\Extension\ExtensionManager;
use PHPUnit\Framework\TestCase;
use s9e\TextFormatter\Parser;

/**
 * Only a pasted Discord link that fof/discord-autolink will certainly claim is
 * unwrapped; everything else stays an <a> — see the class for why.
 */
class BareDiscordLinksTest extends TestCase
{
    private function run_(string $html, bool $enabled = true): string
    {
        $extensions = $this->createStub(ExtensionManager::class);
        $extensions->method('isEnabled')->willReturn($enabled);
        $parser = (new \ReflectionClass(Parser::class))->newInstanceWithoutConstructor();

        return (new BareDiscordLinks($extensions))($parser, null, $html);
    }

    public function test_a_pasted_invite_becomes_a_bare_url(): void
    {
        $this->assertSame('<p>https://discord.gg/flarum</p>', $this->run_('<p><a href="https://discord.gg/flarum" rel="noopener" target="_blank">https://discord.gg/flarum</a></p>'));
    }

    public function test_an_event_invite_keeps_its_ampersand_free_query(): void
    {
        $url = 'https://discord.gg/te7dMZm8?event=1555683235751792691';
        $this->assertSame("<p>$url</p>", $this->run_("<p><a href=\"$url\">$url</a></p>"));
    }

    public function test_channel_message_and_event_links_are_unwrapped(): void
    {
        foreach ([
            'https://discord.com/channels/360670804914208769/360670804914208772',
            'https://discord.com/channels/@me/360670804914208772/1555683235751792691',
            'https://ptb.discord.com/events/360670804914208769/1555683235751792691',
        ] as $url) {
            $this->assertSame("<p>$url</p>", $this->run_("<p><a href=\"$url\">$url</a></p>"));
        }
    }

    public function test_a_link_with_its_own_wording_stays_a_link(): void
    {
        $html = '<p>See <a href="https://discord.gg/flarum">our server</a></p>';
        $this->assertSame($html, $this->run_($html));
    }

    public function test_a_url_the_plugin_would_not_claim_stays_a_link(): void
    {
        foreach (['https://discord.com/channels/1/2', 'https://evil.example/discord.gg/x', 'https://discord.gg.evil.example/flarum', 'https://example.com'] as $url) {
            $html = "<p><a href=\"$url\">$url</a></p>";
            $this->assertSame($html, $this->run_($html), $url);
        }
    }

    public function test_nothing_changes_while_discord_autolink_is_disabled(): void
    {
        $html = '<p><a href="https://discord.gg/flarum">https://discord.gg/flarum</a></p>';
        $this->assertSame($html, $this->run_($html, false));
    }
}
