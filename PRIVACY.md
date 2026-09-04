# Privacy Policy — Reader Comfort

_Last updated: 2026-09-02_

**Reader Comfort does not collect, sell, or share any data. There is no
server, no analytics, and no tracking. It makes no network requests at all,
with one exception you have to turn on yourself (the dictionary — see below).**

## What the extension stores

Everything the extension remembers is kept locally in your own browser, using
the standard extension storage APIs (`chrome.storage.sync` and
`chrome.storage.local`):

| Data | Where | Why |
|---|---|---|
| Your reading preferences (tint, font, text size, spacing, ruler, etc.) | `storage.sync` | So your settings persist and, if you're signed into the browser, follow you to your other devices via the browser's own sync — never through us |
| Highlights, annotations, and sticky notes you create, keyed by page URL | `storage.local` | So they reappear when you revisit a page |
| Which colour / tool you last used | `storage.local` | Convenience |

This data never leaves your browser. The fonts the extension uses are bundled
inside the package, not fetched.

## The dictionary (opt-in, off by default)

If — and only if — you tick **"Right-click a highlighted word for its
definition"** in the popup, then right-clicking a highlighted word sends **that
one word** to the free, keyless public API at `api.dictionaryapi.dev` to fetch
its definition. Nothing else is sent: no page URL, no other page text, no
identifier, no cookies (`credentials: "omit"`). Definitions fetched during a
visit are cached in memory for that page only. This is the extension's only
network request, and it never happens while the setting is off.

## Firefox data collection declaration

Firefox add-ons must now declare what data they collect in the manifest
(`browser_specific_settings.gecko.data_collection_permissions`), shown to you
at install time and on the add-on's Firefox listing. This extension declares
**required: none** and **optional: websiteContent** — nothing is required to
install it, and the only optional category is the single highlighted word the
dictionary feature sends when you turn that feature on (see above).

## Permissions

- **`storage`** — to save the preferences and page markup described above.
- **Host access (`<all_urls>`)** — the reading tools, highlighter, annotations,
  and notes work on whatever page you're reading, so the content script needs
  to run on any site. It only reads and restyles the page you're actively on;
  it does not send page content anywhere.
- **`https://api.dictionaryapi.dev/*`** — only used for the opt-in dictionary
  lookup above.
- **`activeTab`** — so the popup can talk to the tab you clicked it from.
- **`clipboardWrite`** — for the "Copy all highlights" button.

## Contact

Questions: open an issue at
<https://github.com/Breadboio/Reader-Comfort/issues>.
