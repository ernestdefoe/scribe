<?php

namespace ErnestDefoe\Scribe\Formatter;

/**
 * The single source of truth for how rich text is stored.
 *
 * 🚨 These tag names are NOT ours to invent. They are the vocabulary s9e's
 * Litedown plugin has always produced, which means every post written while
 * flarum/markdown was installed is already stored using them. Scribe emits the
 * same names from HTML, so a Scribe post and a legacy Markdown post are the
 * same shape in the database and share one render path. That is what makes
 * flarum/markdown uninstallable without rewriting a single row.
 *
 * The templates below were extracted from s9e/text-formatter 2.19.3's Litedown
 * defaults rather than written by hand, so legacy posts render byte-identically
 * to how they did before. LegacyParityTest asserts they still match, so an s9e
 * upgrade that changes them fails the suite instead of silently changing how
 * years of posts look.
 */
abstract class Vocabulary
{
    /**
     * HTML element => tag name. This is what TipTap is allowed to emit, and it
     * is deliberately a small, closed list: anything not named here is stripped
     * at parse time rather than stored, so a paste from Word cannot smuggle
     * arbitrary markup into a post.
     */
    public const ELEMENTS = [
        'strong' => 'STRONG',
        'b' => 'STRONG',
        'em' => 'EM',
        'i' => 'EM',
        'del' => 'DEL',
        's' => 'DEL',
        'strike' => 'DEL',
        'code' => 'C',
        'sup' => 'SUP',
        'sub' => 'SUB',
        'h1' => 'H1',
        'h2' => 'H2',
        'h3' => 'H3',
        'h4' => 'H4',
        'h5' => 'H5',
        'h6' => 'H6',
        'hr' => 'HR',
        'ul' => 'LIST',
        'ol' => 'LIST',
        'li' => 'LI',
        'blockquote' => 'QUOTE',
        'pre' => 'CODE',
        'a' => 'URL',
        'img' => 'IMG',
    ];

    /**
     * Structural elements kept as themselves. s9e renders a lowercase element
     * literally, so these need no template — and legacy posts already contain
     * bare <br/>, which is why it survives markdown being removed.
     *
     * 🚨 `p` used to live here too. It moved to EXTRA_ELEMENTS/EXTRA_TEMPLATES
     * so it can carry an `align` attribute like H1-H6 do — the rendered output
     * for a plain paragraph (no align) is byte-identical either way, so legacy
     * posts are unaffected.
     */
    public const PASSTHROUGH = ['br'];

    /**
     * Canonical templates, verbatim from Litedown. Only the tags nothing else
     * has claimed get registered — flarum/bbcode owns CODE, DEL, EMAIL, IMG,
     * LI, LIST, QUOTE and URL when it is enabled, and its versions carry extras
     * ours must not clobber (syntax highlighting on CODE, the `uncited` class
     * on QUOTE). See Configure::class.
     */
    public const TEMPLATES = [
        'C' => '<code><xsl:apply-templates/></code>',
        'CODE' => '<pre><code><xsl:if test="@lang"><xsl:attribute name="class"><xsl:text>language-</xsl:text><xsl:value-of select="@lang"/></xsl:attribute></xsl:if><xsl:apply-templates/></code></pre>',
        'DEL' => '<del><xsl:apply-templates/></del>',
        'EM' => '<em><xsl:apply-templates/></em>',
        'EMAIL' => '<a href="mailto:{@email}"><xsl:apply-templates/></a>',
        'H1' => '<h1><xsl:if test="@align"><xsl:attribute name="style"><xsl:text>text-align:</xsl:text><xsl:value-of select="@align"/></xsl:attribute></xsl:if><xsl:apply-templates/></h1>',
        'H2' => '<h2><xsl:if test="@align"><xsl:attribute name="style"><xsl:text>text-align:</xsl:text><xsl:value-of select="@align"/></xsl:attribute></xsl:if><xsl:apply-templates/></h2>',
        'H3' => '<h3><xsl:if test="@align"><xsl:attribute name="style"><xsl:text>text-align:</xsl:text><xsl:value-of select="@align"/></xsl:attribute></xsl:if><xsl:apply-templates/></h3>',
        'H4' => '<h4><xsl:if test="@align"><xsl:attribute name="style"><xsl:text>text-align:</xsl:text><xsl:value-of select="@align"/></xsl:attribute></xsl:if><xsl:apply-templates/></h4>',
        'H5' => '<h5><xsl:if test="@align"><xsl:attribute name="style"><xsl:text>text-align:</xsl:text><xsl:value-of select="@align"/></xsl:attribute></xsl:if><xsl:apply-templates/></h5>',
        'H6' => '<h6><xsl:if test="@align"><xsl:attribute name="style"><xsl:text>text-align:</xsl:text><xsl:value-of select="@align"/></xsl:attribute></xsl:if><xsl:apply-templates/></h6>',
        'HR' => '<hr/>',
        'IMG' => '<img src="{@src}"><xsl:copy-of select="@alt"/><xsl:copy-of select="@title"/></img>',
        'LI' => '<li><xsl:apply-templates/></li>',
        'LIST' => '<xsl:choose><xsl:when test="not(@type)"><ul><xsl:apply-templates/></ul></xsl:when><xsl:otherwise><ol><xsl:copy-of select="@start"/><xsl:apply-templates/></ol></xsl:otherwise></xsl:choose>',
        'QUOTE' => '<blockquote><div><xsl:apply-templates/></div></blockquote>',
        'STRONG' => '<strong><xsl:apply-templates/></strong>',
        'SUB' => '<sub><xsl:apply-templates/></sub>',
        'SUP' => '<sup><xsl:apply-templates/></sup>',
        'URL' => '<a href="{@url}"><xsl:copy-of select="@title"/><xsl:apply-templates/></a>',
    ];

    /**
     * Everything above exists to stay bug-compatible with Markdown. Everything
     * below is what Scribe adds because it no longer has to be expressible in
     * Markdown at all.
     *
     * 🚨 Tables are the headline: Litedown has NO table syntax, so on a
     * Markdown forum a pasted table renders as a paragraph full of pipes. That
     * is not a bug we are fixing, it is a feature Flarum never had. No existing
     * post can contain these tags, so we own them outright.
     */
    public const EXTRA_ELEMENTS = [
        'p' => 'P',
        'u' => 'U',
        'mark' => 'MARK',
        'table' => 'TABLE',
        'thead' => 'THEAD',
        'tbody' => 'TBODY',
        'tr' => 'TR',
        'th' => 'TH',
        'td' => 'TD',
        'span' => 'SPAN',
        'details' => 'SCRIBESPOILER',
        'aside' => 'SCRIBEINFO',
        'section' => 'SCRIBEREPLY',
        'figure' => 'SCRIBEIMGALIGN',
        // `video` => SCRIBEVIDEO is registered by VideoEmbed, from the
        // provider registry, because each provider brings its own id pattern.
    ];

    public const EXTRA_TEMPLATES = [
        /*
         * Same shape s9e's own HTMLElements passthrough produced for a plain
         * <p> — the only addition is the conditional align style, so a
         * paragraph without one renders byte-identical to before.
         */
        'P' => '<p><xsl:if test="@align"><xsl:attribute name="style"><xsl:text>text-align:</xsl:text><xsl:value-of select="@align"/></xsl:attribute></xsl:if><xsl:apply-templates/></p>',
        'U' => '<u><xsl:apply-templates/></u>',
        /*
         * 🚨 Same `#color`-filtered `data-color` boundary as SPAN below, just
         * background instead of text — TipTap's own Highlight extension in
         * `multicolor` mode already emits `data-color`, so nothing bespoke was
         * needed client-side.
         *
         * 🚨 `data-color` is re-emitted here, not just `style`. Re-opening a
         * coloured/highlighted post for editing loads this rendered HTML, and
         * ScribeColor/Highlight's parseHTML looks for the attribute — a
         * style-only render would silently lose the mark on every re-edit.
         */
        'MARK' => '<mark><xsl:if test="@color"><xsl:attribute name="data-color"><xsl:value-of select="@color"/></xsl:attribute><xsl:attribute name="style"><xsl:text>background-color:</xsl:text><xsl:value-of select="@color"/></xsl:attribute></xsl:if><xsl:apply-templates/></mark>',
        'TABLE' => '<div class="Scribe-tableWrap"><table><xsl:apply-templates/></table></div>',
        'THEAD' => '<thead><xsl:apply-templates/></thead>',
        'TBODY' => '<tbody><xsl:apply-templates/></tbody>',
        'TR' => '<tr><xsl:apply-templates/></tr>',
        /*
         * 🚨 `colwidth` is @tiptap/extension-table's own column-drag output
         * (a comma list, one width per spanned column — see its
         * `parseColwidth`). Only the first value is used here: rendering
         * per-spanned-column widths precisely needs a <colgroup> matching
         * every column in the table, not just this one cell's own width —
         * out of scope for now. A single-column drag (the common case) gets
         * exactly the width the user set; a resized cell that also spans
         * multiple columns gets an approximation, not a broken width.
         */
        'TH' => '<th><xsl:copy-of select="@colspan"/><xsl:copy-of select="@rowspan"/><xsl:if test="@align or (@colwidth and @colwidth!=&apos;0&apos;)"><xsl:attribute name="style"><xsl:if test="@align">text-align:<xsl:value-of select="@align"/>;</xsl:if><xsl:if test="@colwidth and @colwidth!=&apos;0&apos;">width:<xsl:choose><xsl:when test="contains(@colwidth,&apos;,&apos;)"><xsl:value-of select="substring-before(@colwidth,&apos;,&apos;)"/></xsl:when><xsl:otherwise><xsl:value-of select="@colwidth"/></xsl:otherwise></xsl:choose>px;</xsl:if></xsl:attribute></xsl:if><xsl:apply-templates/></th>',
        'TD' => '<td><xsl:copy-of select="@colspan"/><xsl:copy-of select="@rowspan"/><xsl:if test="@align or (@colwidth and @colwidth!=&apos;0&apos;)"><xsl:attribute name="style"><xsl:if test="@align">text-align:<xsl:value-of select="@align"/>;</xsl:if><xsl:if test="@colwidth and @colwidth!=&apos;0&apos;">width:<xsl:choose><xsl:when test="contains(@colwidth,&apos;,&apos;)"><xsl:value-of select="substring-before(@colwidth,&apos;,&apos;)"/></xsl:when><xsl:otherwise><xsl:value-of select="@colwidth"/></xsl:otherwise></xsl:choose>px;</xsl:if></xsl:attribute></xsl:if><xsl:apply-templates/></td>',
        /*
         * 🚨 The colour lives in an attribute filtered by s9e's #color, never in
         * a style string we assemble from user input. A span whose style we
         * concatenated by hand is a stored-XSS hole: "red;background:url(...)"
         * is a perfectly ordinary-looking colour until it isn't.
         */
        'SPAN' => '<span><xsl:if test="@color"><xsl:attribute name="data-color"><xsl:value-of select="@color"/></xsl:attribute><xsl:attribute name="style"><xsl:text>color:</xsl:text><xsl:value-of select="@color"/></xsl:attribute></xsl:if><xsl:apply-templates/></span>',
        /*
         * 🚨 The editor emits a bare `<details data-title>` with no <summary> —
         * the title bar and the body wrapper below are render-time-only, added
         * here rather than shipped from the client, so the server is the one
         * place that decides what a spoiler looks like. `data-title` is
         * mirrored back onto the tag itself (not just into <summary>'s text)
         * so re-opening the post for editing recognises it — see ScribeSpoiler's
         * parseHTML, which reads `[data-title]` and ignores <summary> entirely.
         */
        'SCRIBESPOILER' => '<details class="Scribe-spoiler"><xsl:if test="@label"><xsl:attribute name="data-title"><xsl:value-of select="@label"/></xsl:attribute></xsl:if><summary><xsl:value-of select="@label"/></summary><div class="Scribe-spoilerBody"><xsl:apply-templates/></div></details>',
        /*
         * 🚨 Same three-colour shape as magicbb's [info title=… font=… bg=…
         * border=…], collapsed to the one visual style this forum actually
         * uses — no success/warning/error variants, because nobody asked for
         * more than one. font/bg/border go through #color exactly like SPAN's
         * colour; there is no free-text style path here either.
         */
        'SCRIBEINFO' => '<aside class="Scribe-info"><xsl:if test="@label"><xsl:attribute name="data-title"><xsl:value-of select="@label"/></xsl:attribute></xsl:if><xsl:if test="@font"><xsl:attribute name="data-font"><xsl:value-of select="@font"/></xsl:attribute></xsl:if><xsl:if test="@bg"><xsl:attribute name="data-bg"><xsl:value-of select="@bg"/></xsl:attribute></xsl:if><xsl:if test="@border"><xsl:attribute name="data-border"><xsl:value-of select="@border"/></xsl:attribute></xsl:if><xsl:if test="@bg or @border or @font"><xsl:attribute name="style"><xsl:if test="@bg">background:<xsl:value-of select="@bg"/>;</xsl:if><xsl:if test="@border">border-color:<xsl:value-of select="@border"/>;</xsl:if><xsl:if test="@font">color:<xsl:value-of select="@font"/>;</xsl:if></xsl:attribute></xsl:if><xsl:if test="@label"><div class="Scribe-infoTitle"><xsl:value-of select="@label"/></div></xsl:if><div class="Scribe-infoBody"><xsl:apply-templates/></div></aside>',
        /*
         * 🚨 Enforced server-side by ReplyGate (a Formatter render callback):
         * for a viewer who has not replied, the children are removed from the
         * XML before this template runs and the gate carries @withheld. For
         * everyone entitled, the real content ships and js/src/forum/replyGate.ts
         * toggles which half is visible, as before. When a viewer replies, the
         * JS fetches each withheld post again, so it still unlocks without a
         * page reload.
         */
        /*
         * The locked message is a TOKEN, not a sentence.
         *
         * An XSL template is compiled once and cannot call the translator, so
         * whatever sits here is what every reader on every forum sees. This
         * template arrived carrying a Turkish sentence, which would have gone
         * out to every English forum that installed it.
         *
         * Configure swaps the token for the forum's default-locale string when
         * the formatter is built, and replyGate.ts overwrites it again with the
         * viewer's own translation on render. The baked-in default is what
         * keeps the message sensible when JS never runs.
         */
        'SCRIBEREPLY' => '<div class="Scribe-replyGate"><xsl:if test="@withheld"><xsl:attribute name="data-withheld">1</xsl:attribute></xsl:if><p class="Scribe-replyGateLocked">%scribe.replyGateLocked%</p><div class="Scribe-replyGateBody"><xsl:apply-templates/></div></div>',
        /*
         * 🚨 `align` on the image ITSELF doesn't work: `IMG` is a tag
         * `flarum/bbcode` claims when enabled (registerTags skips it,
         * exactly like the SPOILER/INFO collision earlier), so an attribute
         * added to Scribe's own copy of IMG's definition never actually gets
         * registered on the tag flarum/bbcode owns. A wrapper is a tag name
         * nobody else has any reason to claim, so it sidesteps the
         * collision instead of trying to extend a foreign tag.
         */
        'SCRIBEIMGALIGN' => '<figure class="Scribe-imgAlign"><xsl:if test="@align"><xsl:attribute name="data-align"><xsl:value-of select="@align"/></xsl:attribute></xsl:if><xsl:apply-templates/></figure>',
    ];

    /**
     * tag => [ attribute => s9e filter ]. The filter is the security boundary:
     * a value that fails it is dropped, so the template can interpolate the
     * attribute without ever trusting what the client sent.
     */
    public const ATTRIBUTES = [
        'CODE' => ['lang' => '#simpletext'],
        'EMAIL' => ['email' => '#email'],
        'IMG' => ['src' => '#url', 'alt' => '#simpletext', 'title' => '#simpletext'],
        'LIST' => ['type' => '#simpletext', 'start' => '#uint'],
        'URL' => ['url' => '#url', 'title' => '#simpletext'],
        'TH' => ['colspan' => '#uint', 'rowspan' => '#uint', 'align' => '#simpletext', 'colwidth' => '#simpletext'],
        'TD' => ['colspan' => '#uint', 'rowspan' => '#uint', 'align' => '#simpletext', 'colwidth' => '#simpletext'],
        'SPAN' => ['color' => '#color'],
        /*
         * 🚨 Same interpolation shape as TH/TD's `align`: the value lands
         * inside a `style` attribute, so #simpletext (letters/digits/space/
         * ./,/_/-/+ only, no `;`, `:` or `(`) is the security boundary, not
         * the template. It cannot break out into a second declaration.
         */
        'P' => ['align' => '#simpletext'],
        'H1' => ['align' => '#simpletext'],
        'H2' => ['align' => '#simpletext'],
        'H3' => ['align' => '#simpletext'],
        'H4' => ['align' => '#simpletext'],
        'H5' => ['align' => '#simpletext'],
        'H6' => ['align' => '#simpletext'],
        'MARK' => ['color' => '#color'],
        /*
         * 🚨 `#title` is not an s9e built-in — see Configure::resolveFilter.
         * #simpletext is ASCII-only and would reject "başlık"; the value only
         * ever lands in a text node via xsl:value-of (auto-escaped), never
         * interpolated into an attribute or style, so it doesn't need
         * #simpletext's CSS-safety guarantee either.
         */
        'SCRIBESPOILER' => ['label' => '#title'],
        'SCRIBEINFO' => ['label' => '#title', 'font' => '#color', 'bg' => '#color', 'border' => '#color'],
        'SCRIBEIMGALIGN' => ['align' => '#simpletext'],
    ];

    /**
     * Where an attribute is named differently in the HTML the editor emits.
     *
     * 🚨 `type` on LIST is not cosmetic. Both <ul> and <ol> alias to the single
     * LIST tag, and the template picks <ul> vs <ol> purely on whether @type is
     * present — so an ordered list that forgets to emit data-type silently
     * renders as a bulleted one. The editor's ordered-list node MUST set it.
     */
    public const SOURCE_ATTRIBUTES = [
        'url' => 'href',
        'src' => 'src',
        'color' => 'data-color',
        'lang' => 'data-lang',
        'type' => 'data-type',
        'align' => 'data-align',
        'label' => 'data-title',
        'font' => 'data-font',
        'bg' => 'data-bg',
        'border' => 'data-border',
    ];
}
