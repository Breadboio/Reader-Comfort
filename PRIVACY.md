# Privacy Policy — Reader Comfort

_Last updated: 2026-09-01_

**Reader Comfort does not collect, transmit, sell, or share any data. There is
no server, no analytics, and no tracking.**

## What the extension stores

Everything the extension remembers is kept locally in your own browser, using
the standard extension storage APIs (`chrome.storage.sync` and
`chrome.storage.local`):

| Data | Where | Why |
|---|---|---|
| Your reading preferences (tint, font, text size, spacing, ruler, etc.) | `storage.sync` | So your settings persist and, if you're signed into the browser, follow you to your other devices via the browser's own sync — never through us |
| Highlights, annotations, and sticky notes you create, keyed by page URL | `storage.local` | So they reappear when you revisit a page |
| Which colour / tool you last used | `storage.local` | Convenience |

This data never leaves your browser. The extension makes **no network
requests** of any kind — the fonts it uses are bundled inside the extension
package.

## Permissions

- **`storage`** — to save the preferences and page markup described above.
- **Host access (`<all_urls>`)** — the reading tools, highlighter, annotations,
  and notes work on whatever page you're reading, so the content script needs
  to run on any site. It only reads and restyles the page you're actively on;
  it does not send page content anywhere.
- **`activeTab`** — so the popup can talk to the tab you clicked it from.
- **`clipboardWrite`** — for the "Copy all highlights" button.

## Contact

Questions: open an issue at
<https://github.com/Breadboio/Reader-Comfort/issues>.
