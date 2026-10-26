<?php

namespace ErnestDefoe\Scribe\Tests\Formatter;

use ErnestDefoe\Scribe\Formatter\CodeBlocksWithoutInnerCode;
use ErnestDefoe\Scribe\Formatter\DecodeEntitiesInCode;
use PHPUnit\Framework\TestCase;
use s9e\TextFormatter\Configurator;

/**
 * Code written as HTML showed "&lt;?php" to readers — see the class.
 */
class DecodeEntitiesInCodeTest extends TestCase
{
    private array $formatter;

    protected function setUp(): void
    {
        $c = new Configurator();
        $c->tags->add('CODE')->template = '<pre><code><xsl:apply-templates/></code></pre>';
        $c->tags['CODE']->attributes->add('lang')->required = false;
        $c->tags->add('C')->template = '<code><xsl:apply-templates/></code>';
        $c->tags->add('P')->template = '<p><xsl:apply-templates/></p>';
        $h = $c->plugins->load('HTMLElements');
        $h->aliasElement('pre', 'CODE');
        $h->aliasAttribute('pre', 'data-lang', 'lang');
        $h->aliasElement('code', 'C');
        $h->aliasElement('p', 'P');
        $c->plugins->load('HTMLEntities');
        $c->Litedown;
        $this->formatter = $c->finalize();
    }

    /** @return array{0: string, 1: string} rendered HTML and the source it unparses to */
    private function roundTrip(string $html): array
    {
        $xml = $this->formatter['parser']->parse(CodeBlocksWithoutInnerCode::apply($html));
        $renderer = $this->formatter['renderer'];

        return [$renderer->render(DecodeEntitiesInCode::apply($xml)), \s9e\TextFormatter\Unparser::unparse($xml)];
    }

    public function test_a_code_block_shows_its_characters_and_keeps_its_source_escaped(): void
    {
        $in = '<pre><code class="language-php">&lt;?php echo "a&lt;b &amp; c";</code></pre>';
        [$html, $source] = $this->roundTrip($in);

        $this->assertSame('<pre><code>&lt;?php echo "a&lt;b &amp; c";</code></pre>', $html);
        $this->assertSame('<pre data-lang="php">&lt;?php echo "a&lt;b &amp; c";</pre>', $source);
    }

    public function test_inline_code_shows_its_characters(): void
    {
        [$html] = $this->roundTrip('<p>x <code>&lt;b&gt; &amp;amp;</code> y</p>');

        $this->assertSame('<p>x <code>&lt;b&gt; &amp;amp;</code> y</p>', $html);
    }

    public function test_a_decoded_closing_tag_cannot_end_the_block(): void
    {
        [$html] = $this->roundTrip('<pre>&lt;/pre&gt;&lt;script&gt;x&lt;/script&gt;</pre><p>after</p>');

        $this->assertSame('<pre><code>&lt;/pre&gt;&lt;script&gt;x&lt;/script&gt;</code></pre><p>after</p>', $html);
    }

    public function test_markdown_code_is_left_literal(): void
    {
        [$html] = $this->roundTrip("`&lt;b&gt;`\n\n```\n&amp;\n```");

        $this->assertStringContainsString('<code>&amp;lt;b&amp;gt;</code>', $html);
        $this->assertStringContainsString('&amp;amp;', $html);
    }
}
