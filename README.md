# Scribe

A true WYSIWYG editor for Flarum 2 — TipTap, with **no Markdown anywhere in the stack**.

Both `flarum/markdown` and `fof/rich-text` can be uninstalled. Existing posts keep
rendering exactly as they did, with no migration and no rewritten rows.

![The Scribe composer](screenshots/composer.png)

## Why this exists

Every WYSIWYG editor for Flarum so far has been a rich editor sitting *on top of*
Markdown: the document is serialised to Markdown on submit and re-parsed on load.
That is why `flarum/markdown` is a hard dependency of `fof/rich-text`, and why
Markdown syntax keeps leaking into a supposedly what-you-see-is-what-you-get
experience — type `**bold**` and it turns bold, paste code with underscores and it
turns italic.

Scribe removes the Markdown layer entirely. TipTap already speaks HTML natively,
so dropping Markdown makes the pipeline *simpler*, not harder.

## How your existing posts survive

Flarum stores posts as s9e TextFormatter XML, not as source text. The tag
vocabulary in that XML — `STRONG`, `EM`, `H2`, `LIST`, `LI`, `C` … — belongs to
s9e, not to Markdown. Markdown was only ever one parser feeding those tags.

Scribe emits the same vocabulary from HTML, and supplies templates for the tags
`flarum/markdown` used to own. A post written years ago in Markdown and a post
written today in Scribe are the same shape in the database and share one render
path.

**Uninstalling `flarum/markdown` without this would silently flatten every post you
have**: the text survives, every heading, bold, list and code span does not. That
is not a warning drawn from theory — it is what happens, and it is the specific
failure Scribe exists to prevent.

Where `flarum/bbcode` is enabled it keeps ownership of the tags it already
provides (`CODE`, `QUOTE`, `URL`, `IMG`, `LIST`, `LI`, `DEL`, `EMAIL`), so syntax
highlighting and quote citation are untouched.

## Beyond Markdown

Because posts no longer have to be expressible in Markdown, Scribe adds what
Markdown could not represent:

- **Tables.** s9e's Litedown has no table syntax at all, so on a Markdown forum a
  table renders as a paragraph full of pipes.
- **Text colour, highlight and underline** — colour by swatch or hex.
- **Superscript and subscript**, for footnote markers and formulae.
- **Text alignment** — left, centre, right, justify.
- **Image alignment and resizing.**
- **Spoilers** — a titled block the reader clicks to open.
- **Info boxes** — a titled callout for the thing people keep missing.
- **Reply-to-view** — content that stays folded away until the reader has
  replied to the discussion. **Read the caveat below before you use it.**

### Reply-to-view is a nudge, not a lock

The gated content is in the page. It is sent to every reader in the post's HTML,
and the browser is what hides it — so anyone who opens the developer tools, reads
the page source, or disables CSS can read it without replying.

That makes it a fine way to encourage participation, and the wrong tool for
anything you actually need withheld: no private information, nothing paid, no
answer key. If a reader must not be able to see something, it cannot be in the
post at all.

## Build your own toolbar

Every feature is a chip you drag into the toolbar, in the order you want it.
Nothing is forced on your members, and nothing you remove is still lurking behind
a keyboard shortcut.

![The toolbar builder in the AdminCP](screenshots/admin.png)

Keyboard users get the same control: Enter adds a feature, arrow keys move it,
Delete removes it.

## Performance

TipTap and ProseMirror are about 430KB. Bundling that into `forum.js` means every
visitor downloads, parses and executes it on every page view — including guests
who cannot post at all. That is what made earlier TipTap editors feel heavy.

Scribe loads the editor in a separate chunk, on first use:

| Asset | Size | When it loads |
| --- | --- | --- |
| `forum.js` | **10 KiB** | every page |
| the editor chunk | 431 KiB | first time a composer opens |

The toolbar also re-renders only when the set of active buttons actually changes,
rather than on every keystroke.

## Works with what you already run

- **Mentions** — unchanged. `@name` autocomplete and rendering are untouched.
- **Quoting a post** — `flarum/mentions` inserts Markdown through the editor
  interface; Scribe translates it into a real blockquote.
- **FoF Upload** — inserts `![alt](url)`; Scribe turns it into a real image node.
- **flarum/bbcode** — keep it or don't; Scribe defers to it where they overlap.

## Installation

```bash
composer require ernestdefoe/scribe
php flarum cache:clear
```

Then disable `flarum/markdown` (and remove `fof/rich-text`, which Scribe conflicts
with). Your existing posts will render exactly as before.

## Requirements

- Flarum 2.0
- PHP 8.3+

## Licence

MIT.

## Changelog

Every release, with what changed and why: **[CHANGELOG.md](CHANGELOG.md)**.
