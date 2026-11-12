<?php

namespace ErnestDefoe\Scribe\Tests\Formatter;

use ErnestDefoe\Scribe\Formatter\Configure;
use PHPUnit\Framework\TestCase;
use s9e\TextFormatter\Configurator;
use s9e\TextFormatter\Unparser;

/**
 * Posts written before Scribe, with flarum/markdown or fof/rich-text (namavic,
 * issue 1). Their stored XML must keep rendering with Markdown switched off,
 * and their source — what the edit composer receives — is Markdown text, which
 * js/src/common/legacySource.ts turns back into formatting. The sources these
 * tests pin are the inputs js/tests/legacySource.test.mjs starts from.
 */
class LegacyPostTest extends TestCase
{
    /** Exactly as reported: two paragraphs, a bold word, stored by flarum/markdown. */
    private const ISSUE_XML = "<r><p>Line one</p>\n\n<p>What do you think <STRONG><s>**</s>this<e>**</e></STRONG></p></r>";

    private static $parser;
    private static $renderer;

    public static function setUpBeforeClass(): void
    {
        $config = new Configurator();
        $config->rootRules->enableAutoLineBreaks();
        $config->plugins->load('Autolink');
        $config->plugins->load('HTMLEntities');
        (new Configure())($config);

        $built = $config->finalize();
        self::$parser = $built['parser'];
        self::$renderer = $built['renderer'];
    }

    public function test_the_reported_post_still_renders_with_markdown_off(): void
    {
        $html = self::$renderer->render(self::ISSUE_XML);

        $this->assertStringContainsString('<p>Line one</p>', $html);
        $this->assertStringContainsString('<strong>this</strong>', $html);
        $this->assertStringNotContainsString('**', $html);
    }

    public function test_its_source_is_markdown_text_not_html(): void
    {
        // What Flarum hands the edit composer.
        $this->assertSame("Line one\n\nWhat do you think **this**", Unparser::unparse(self::ISSUE_XML));
    }

    public function test_the_editor_output_for_it_saves_as_two_paragraphs_and_bold(): void
    {
        // What legacySource turns that source into, saved through Scribe.
        $xml = self::$parser->parse('<p>Line one</p><p>What do you think <strong>this</strong></p>');
        $html = self::$renderer->render($xml);

        $this->assertSame(2, substr_count($html, '<p>'), $html);
        $this->assertStringContainsString('<strong>this</strong>', $html);
        $this->assertStringNotContainsString('**', $html);
    }

    public function test_a_scribe_post_unparses_to_the_html_it_was_written_as(): void
    {
        // The load path legacySource leaves alone: it opens with a block tag.
        $source = '<p>Hi <strong>there</strong></p><ul><li><p>one</p></li></ul>';

        $this->assertSame($source, Unparser::unparse(self::$parser->parse($source)));
    }
}
