# Changelog

Scribe — a true WYSIWYG editor for Flarum 2, with no Markdown anywhere in the
stack.

Every entry links to its full release notes, which carry the reasoning and, for
the bugs, what actually went wrong.

## [1.2.0] — 2026-09-23

**Other extensions can now add to the editor.** Scribe's node list and its
toolbar were both closed — a fixed array and a fixed const — so nothing outside
this repository could teach the editor a new kind of content. That is now a
registry.

### Added

- **`registerExtension()` and `registerButton()`.** An extension hands over a
  factory and gets `Node`, `Mark`, `Extension` and `mergeAttributes` back, so it
  can build a TipTap node **without depending on TipTap**. That matters more than
  it sounds: importing `@tiptap/core` to build one node would pull 430KB into a
  bundle Flarum loads on every page, quietly undoing the split Scribe exists to
  maintain. The factory runs once, when a composer is first opened.
- **A registered button carries its own `translationKey`**, resolved verbatim
  instead of under Scribe's namespace — where another extension has no entries,
  and its tooltip would otherwise render as the raw key.
- **Registered buttons appear in the AdminCP toolbar builder**, and are added to
  the toolbar for admins who have never arranged theirs by hand. An arrangement
  made on purpose is left alone: an extension installed later does not push a
  button into it.

See **[Extending Scribe](README.md#extending-scribe)** for the shape of it,
including the half that is easy to miss — the element has to be registered
server-side too, or the post saves and the content is silently gone.

## [1.1.2] — 2026-09-15

**Pasting an image gives you one image.** Reported by **@tennyy** — two bugs
landing on top of each other.

### Fixed

- **Pasting an image made two of them.** The clipboard carries an image in
  several forms at once: the file, and an HTML fragment pointing at wherever it
  came from. FoF Upload took the file and uploaded it while the editor had
  already pasted the fragment — so you got your upload *and* a copy hotlinked
  from a source that might be private or might expire, plus a line of raw
  `[upl-image-preview …]` text. Pasting now does what it does in the plain
  editor: one upload, one image.
- **FoF Upload's image-preview tag is understood.** Upload inserts images in one
  of two formats and Scribe only knew one of them. The other — the default for
  images, and what a paste produces — was dropped into the post as literal text.
  It now becomes the image it describes, at full size rather than the thumbnail.

### Internal

- The translation layer both fixes live in had no tests, despite deciding what
  happens to everything another extension hands the composer — a quoted post, a
  finished upload. It has them now, and CI runs them with the type check and the
  build.

## [1.1.1] — 2026-09-11

**Tables were unreadable in dark mode.** A one-line fix with a wide blast radius.

### Fixed

- `.Scribe-tableWrap td` and `tbody th` were both filled with `#e4eaf7` and had
  no dark variant, while the text colour follows the forum's theme. On any dark
  forum a table rendered as near-white text on a near-white cell — roughly a
  **1.06:1 contrast ratio**. Not hard to read: invisible. This affected every
  Scribe site in dark mode, in every table ever posted, from the day tables
  shipped. Both fills now mix the text colour into the background so the tint
  inverts with the theme, and follows a custom text colour too. Light-only
  forums see no difference.

## [1.1.0] — 2026-09-11

Folds in the work from [Kadebostany/scribe-x](https://github.com/Kadebostany/scribe-x),
a fork that added editor surface Scribe was missing — with thanks to its author.
Ported, reviewed and verified against the existing post corpus rather than
merged blind.

### Added

- **Colour** — a picker for text colour and highlight, with hex entry
- **Text alignment** — left, centre, right, justify
- **Spoiler** and **info box** blocks
- **Reply-to-view** — hide content until the reader replies
- **H1 and H4** headings, **superscript** and **subscript**
- **Tables** — per-column widths, vertical cell centring
- **Images** — alignment and resizing
- **Empty lines** as deliberate spacing
- Align and table controls grouped in the toolbar rather than scattered

### Changed

- **The hard `conflict: fof/rich-text` is gone.** It made Scribe impossible to
  try — you had to uninstall your existing editor first, blind, before Composer
  would let you see whether you liked this one. Scribe now stands down at
  runtime instead: with `flarum/markdown` or `fof/rich-text` enabled its
  **editor** stays out of the way, while its **formatter and stylesheet keep
  loading**, so every spoiler, table and coloured span already written still
  renders. Switching editors must never cost readers content already posted.
  Verified with all three installed at once.

### Fixed

- **The reply-to-view gate shipped a hardcoded Turkish sentence** to every
  forum. Now translatable, and the formatter behind it can no longer fatal — a
  template that cannot resolve falls back instead of taking the page down.
- Corrected the declared PHP floor to **8.3**, which is what the code requires.

## [1.0.3] — 2026-09-02

**The editor collapsed on mobile.**

### Fixed

- On a phone the editing area could shrink to a sliver — narrow enough to look
  absent, even with text in it. Reported in Firefox and Brave. The editor set up
  a flex layout for its contents but never declared how it should behave as a
  flex *item*, so it took its height from content that declared a minimum of
  zero. Desktop never showed it because Flarum gives that element a definite
  height there; the full-screen mobile composer does not. It now claims its
  share of the composer, with a floor on mobile so it cannot collapse whatever
  surrounds it.

## [1.0.2] — 2026-09-02

**Play nicely with other composer extensions.** Reported by **@Forogramero**,
with the console trace that identified it.

### Fixed

- Scribe could fill the console with errors and leave the composer looking
  broken, most visibly on mobile. The cause was ours. Flarum's built-in editor
  puts a `<textarea>` on `composer.editor.el`, so other extensions read
  `el.value` and listen for `input` on it — a contract long predating this
  extension. Scribe replaces that textarea with a rich-text element, so anything
  relying on the old shape got `undefined`. A character counter doing
  `el.value.length` threw on **every keystroke**, and because those listeners ran
  without isolation, one extension's error stopped the toolbar updating and
  cascaded into the editor. Scribe now keeps the contract: `el.value` reads and
  writes the editor's text, a native `input` event fires on every change, and
  listeners run in isolation so one misbehaving extension cannot take the editor
  down. Confirmed against **MagicRead**, whose counter triggered the report.

## [1.0.1] — 2026-09-01

Housekeeping only — no functional change from 1.0.0. Nothing here you need if
you are already on it.

- Adds the `LICENSE` file. `composer.json` declared MIT from the start, but the
  file was never committed, so "MIT licensed" linked to nothing.
- Fills in `composer.json`'s `support` block: issues, source, and the
  [Scribe support tag](https://ernestdefoe.online/t/scribe).

## [1.0.0] — 2026-09-01

First release. Both `flarum/markdown` and `fof/rich-text` can be uninstalled,
and existing posts keep rendering exactly as they did — no migration, no
rewritten rows.

### What makes it different

Every WYSIWYG editor for Flarum so far has been a rich editor sitting *on top
of* Markdown: the document is serialised to Markdown on submit and re-parsed on
load. That is why `flarum/markdown` is a hard dependency of `fof/rich-text`, and
why Markdown syntax keeps leaking into a supposedly what-you-see-is-what-you-get
experience. Scribe removes that layer — TipTap already speaks HTML natively, so
dropping Markdown makes the pipeline simpler, not harder. Type `**asterisks**`
and they stay as typed.

### Your existing posts are safe

Flarum stores posts as s9e TextFormatter XML, and that tag vocabulary belongs to
**s9e, not to Markdown** — Markdown was only ever one parser feeding it. Scribe
emits the same vocabulary from HTML and supplies templates for the tags
`flarum/markdown` used to own, so old and new posts share one render path.
Uninstalling `flarum/markdown` *without* something doing this would silently
flatten every post you have: the text survives, every heading, bold, list and
code span does not.

### Things Markdown could not do

- **Tables.** s9e's Litedown has no table syntax at all, so on a Markdown forum
  a table renders as a paragraph full of pipes.
- **Text colour**, underline and highlight.

### Performance

TipTap and ProseMirror are ~430KB, and bundling that into `forum.js` means every
visitor downloads and executes it on every page — including guests who cannot
post. Scribe loads the editor as a separate chunk on first use.

| Asset | Size | When it loads |
| --- | --- | --- |
| `forum.js` | **10 KiB** | every page |
| editor chunk | 431 KiB | first time a composer opens |

### Works with what you already run

Mentions unchanged; quoting a post becomes a real blockquote; FoF Upload becomes
a real image node; `flarum/bbcode` keeps ownership of the tags it already
provides, so syntax highlighting and quote citation are untouched.

[1.1.2]: https://github.com/ernestdefoe/scribe/releases/tag/1.1.2
[1.1.1]: https://github.com/ernestdefoe/scribe/releases/tag/1.1.1
[1.1.0]: https://github.com/ernestdefoe/scribe/releases/tag/1.1.0
[1.0.3]: https://github.com/ernestdefoe/scribe/releases/tag/1.0.3
[1.0.2]: https://github.com/ernestdefoe/scribe/releases/tag/1.0.2
[1.0.1]: https://github.com/ernestdefoe/scribe/releases/tag/1.0.1
[1.0.0]: https://github.com/ernestdefoe/scribe/releases/tag/1.0.0
