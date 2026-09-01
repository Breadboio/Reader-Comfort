# Reader Comfort

A cross-browser extension (Manifest V3, **Chrome / Edge / Firefox**) that
applies the reading system from `breadtoasting.com/fortigate-study-guide` to
**any** web page:

- **Page colour** — cream / blue / mint / peach / dark wash
- **Text size** — scales the page's root font size, 80–220 %
- **Line spacing** — tight / normal (1.85) / airy (2.35)
- **Letter & word spacing** — normal / wide
- **Font** — Atkinson Hyperlegible, Lexend, OpenDyslexic, Verdana, or mono
  (bundled woff2, no network)
- **Line width** — cap the main column to a comfortable measure
- **Reading ruler** — a horizontal focus band that follows the pointer
  (dims the rest of the page)
- **Highlighter** — select text, pick a colour (yellow / green / pink / blue);
  highlights persist per-URL and are re-anchored on reload. Click a highlight
  to recolour or remove it. "Quick mode" (`Alt+H`) highlights the instant you
  select. Popup has per-page count, **Copy all**, and **Clear page**.
- **Draw / annotate** — a full-page freehand layer for arrows, circles,
  scribbles, whatever. Toggle draw mode (`Alt+D` or the popup), a small
  toolbar appears on the page (colour, thin/medium/thick, pen/eraser,
  undo, clear); drag anywhere to draw. Turn draw mode off and the page is
  interactive again — the ink stays put and persists per-URL.
- **Sticky notes** — drop a draggable, resizable note anywhere on the page
  (`Alt+N` or the popup). Drag by its bar, drag the corner to resize, click
  the dot to recolour, collapse or delete. Notes persist per-URL.
- Show italics as bold instead · underline all links · reduce animation

Reading-tool settings are stored in `chrome.storage.sync`. By default they
apply to every site; the popup can also save a **per-site** override (e.g. a
bigger font only on `docs.fortinet.com`). Highlights, annotations, and their
tool prefs live in `chrome.storage.local`, keyed by `origin + pathname + search`.

## Load it (development)

### Chrome / Edge

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder
3. Pin the toolbar icon; click it to open the panel

Chrome shows a harmless *"Unrecognized manifest key 'background.scripts'"*
warning when loading this source folder directly — that key is there for
Firefox. `python3 build.py` produces a clean per-browser package with no
warning (see **Packaging** below).

### Firefox (115+, ideally an ESR / release ≥ 128)

- **Temporary (dev):** `about:debugging#/runtime/this-firefox` → **Load
  Temporary Add-on** → pick `manifest.json`. Gone on restart.
- **Permanent:** needs a signed `.xpi`. Zip the folder contents and submit to
  [addons.mozilla.org](https://addons.mozilla.org/developers/) (or self-host
  with an unlisted signed build via `web-ext sign`). The add-on id
  `reader-comfort@breadtoasting.com` is already set in the manifest.
- After install, open the add-on's options / permissions and **allow it to run
  on all sites** — Firefox MV3 makes the `<all_urls>` host permission opt-in,
  so tint/fonts/highlighter won't appear on a page until it's granted.

Keyboard: `Alt+R` ruler, `Alt+H` quick-highlight, `Alt+D` draw, `Alt+N` sticky
note. (Extension on/off has a command too but no default key — bind it at
`chrome://extensions/shortcuts`, Chrome's cap is 4 default bindings.) Rebind any
of them there, or at `about:addons` → gear → *Manage Extension Shortcuts* on
Firefox.

## Packaging & publishing

```
python3 build.py            # -> dist/reader-comfort-{chrome,firefox}-<ver>.zip
```

`store/PUBLISHING.md` has the step-by-step for the Chrome Web Store, Edge
Add-ons, and addons.mozilla.org (which also covers Firefox for Android).
`store/LISTING.md` is the copy/paste listing text and permission
justifications. `PRIVACY.md` is the privacy policy (link to the GitHub copy
from the store forms). `store/screenshots/` holds the 1280×800 listing shots.

## How it works

- `content.js` runs at `document_start`, injects one `<style>` element with
  `@font-face` rules + a dynamically rebuilt block of `!important` overrides,
  and sets `data-rc-*` attributes on `<html>`.
- `highlighter.js` wraps selections in `<mark class="rc-hl">`. Each highlight
  is stored as a text-quote anchor (`exact` + ~40 chars of `prefix`/`suffix`);
  on reload it flattens the page's text nodes, finds the best context match,
  and re-wraps. A short-lived MutationObserver retries late-rendered content.
- `annotate.js` appends one absolutely-positioned `<svg>` overlay sized to the
  full document. Draw mode flips its `pointer-events` on and captures Pointer
  Events; each stroke is a `<path>` (midpoint-smoothed) stored as a point list
  in **document** coordinates. A `ResizeObserver` keeps the overlay matched to
  the document's size.
- `notes.js` appends a zero-size positioned root; each note is an absolutely
  positioned `<div>` (drag handle + `<textarea>` + native `resize`) stored with
  its document position, size, text, and colour.
- The popup edits a settings object, writes it to storage, and sends the
  content script a live-preview message. `storage.onChanged` keeps other tabs
  in sync.
- `background.js` only relays the keyboard-shortcut commands. It's declared
  as both a `service_worker` (Chrome) and `background.scripts` (Firefox event
  page); the code is a plain top-level listener that works either way.
- All API calls use the callback-style `chrome.*` namespace, which Firefox
  also provides — no `browser.*` polyfill needed.

### Known limits

- **Tint** recolours `html`, `body`, and a list of common content-wrapper
  selectors (`main`, `article`, `.markdown-body`, …). Sites with unusual
  layout wrappers may show the tint only in the margins. It is not a full
  Dark Reader–style recolour engine.
- Text-size scaling assumes the page sizes text in `rem`/`em` (most docs and
  articles do). Pages that hard-code `px` on every element won't scale — use
  browser zoom there.
- The `<style>`-injection approach works on the vast majority of sites; a few
  with very strict `style-src` CSP may block it.
- **Firefox** wasn't run through the automated test here (no Firefox binary on
  the build box) — the Chrome/Edge path is what's verified end-to-end. The
  manifest and APIs are chosen for Firefox MV3 support; test on Firefox before
  relying on it.
- Highlights re-anchor by matching text + context. If a page's wording changes,
  or the passage is behind a tab/accordion that never opens, that highlight
  won't restore — the popup reports how many didn't. Highlighting across
  complex nested markup (tables, code blocks) can occasionally split oddly.
- **Annotations and sticky notes are positioned by absolute document
  coordinates**, not anchored to content. They scroll with the page and survive
  reloads, but if the page's layout above them changes between visits
  (responsive reflow, an injected banner, lazy-loaded content), they drift
  relative to what they were marking. Fine for a quick markup pass; not a
  durable record. While draw mode is on the overlay covers the page, so
  links/buttons underneath aren't clickable until you turn it off.

## Files

```
manifest.json      MV3 manifest (dual Chrome/Firefox — split by build.py)
content.js         the reading engine (tint / size / spacing / font / ruler)
highlighter.js     select-to-highlight, persistence, re-anchoring
annotate.js        freehand draw layer, persistence
notes.js           sticky notes
background.js      keyboard-command relay
popup.html/.js     the "Aa" control panel
fonts/*.woff2      Atkinson Hyperlegible, Lexend, OpenDyslexic (self-hosted)
icons/             generated by make_icons.py (no deps)
build.py           produces per-browser packages in dist/
store/             listing text, publishing steps, screenshots
PRIVACY.md         privacy policy (no data collected)
```
