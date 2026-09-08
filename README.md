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
  (dims the rest of the page). Toggle it with `Alt+R`, the popup, or a
  **triple-click anywhere on the page** (that last one is an option, on by
  default; it's ignored on links, buttons, and form fields). **Hold `Alt+Shift`
  and scroll** to change its height without leaving the page — the band resizes
  under the pointer and shows its height while you turn the wheel (40–400 px).
  The modifier is a setting (`Alt+Shift`, `Alt`, or `Ctrl+Alt`) because every
  combination is claimed by something somewhere: Chrome leaves plain `Alt`
  alone, but Firefox binds `Alt`+scroll to history back/forward by default
  (`mousewheel.with_alt.action`), and several Linux window managers grab it for
  opacity or volume *before the browser sees it* — which no amount of
  `preventDefault` can rescue. `Alt+Shift` is the default as the least-claimed
  of the three. Both gestures can be switched off in the popup or on the
  settings page, and `Ruler — taller` / `Ruler — shorter` are bindable to any
  key in the shortcut editor if the wheel is a lost cause on your desktop.
- **Highlighter** — select text, pick a colour (yellow / green / pink / blue);
  highlights persist per-URL and are re-anchored on reload. Click a highlight
  to recolour or remove it. "Quick mode" (`Alt+H`) highlights the instant you
  select. There's an **on/off toggle** — off, selecting text does nothing
  special and existing highlights disappear until you switch it back on
  (`Esc` also dismisses the colour bar). Popup has per-page count, **Copy
  all**, and **Clear page**.
- **Right-click dictionary** (opt-in) — with it enabled in the popup,
  right-click a highlighted word to get a small definition card
  (`api.dictionaryapi.dev`, no key). This is the *only* network call the
  extension makes, and only that one word is sent — see `PRIVACY.md`.
- **Draw / annotate** — a full-page freehand layer for arrows, circles,
  scribbles, whatever. Toggle draw mode (`Alt+D` or the popup), a small
  toolbar appears on the page (colour, thin/medium/thick, pen/eraser,
  undo, clear); drag anywhere to draw. Turn draw mode off and the page is
  interactive again — the ink stays put and persists per-URL.
- **Sticky notes** — drop a draggable, resizable note anywhere on the page
  (`Alt+N` or the popup). Drag by its bar, drag the corner to resize, click
  the dot to recolour, collapse or delete. Notes persist per-URL.
- **Your own shortcuts and macros** — the browser only gives an extension four
  bindable keys, so there's a shortcut editor of its own on the settings page
  (popup → *Shortcuts & macros…*). Bind any chord to any of 80-odd actions, or to
  a **list** of them: one key that goes dark, switches to Hyperlegible and
  opens the spacing out is a macro. Press the key field, press the combination
  you want, and it's recorded; chords the browser owns (`Ctrl+T`, `F5`, …) are
  refused, and ones that merely tend to clash come with a warning. Bindings
  stand down while you're typing in a field, and there are ready-made macros
  ("Night reading", "Focus mode", "Dyslexia setup") to start from.
- Show italics as bold instead · underline all links · reduce animation
- **PDFs** — Chrome's built-in PDF viewer is a plugin, so no extension can
  reach inside it. Open a PDF and the popup offers **Open in Reader Comfort**,
  which reopens it in a bundled PDF.js viewer where the tools do work. It has
  two modes: *Page view* (the PDF as it looks, with an invisible text layer so
  selection and highlighting work) and **Reading view**, which pulls the text
  out and reflows it as ordinary paragraphs — the only way font, size, spacing
  and line width can apply to a fixed PDF layout. Page view renders lazily: a
  long PDF gets every page's box (so the scrollbar is right immediately) but
  only the handful near the viewport carry a canvas, which is what keeps a
  400-page document from exhausting a low-memory machine.
- **Share what you marked up** — "Save as a web page" writes one
  self-contained `.html` file with your highlighted quotes (plus surrounding
  context), your note text, and your ink as SVG. The recipient needs no
  extension and no network.

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

Those four are the browser's own commands, and four is the ceiling it gives an
extension. Everything past that lives in the **settings page** (popup →
*Shortcuts & macros…*, or the browser's own Options entry for the add-on),
which runs its own key handling from the page and so has no such limit. It
lists the browser commands alongside your own so the whole keyboard is visible
in one place, and refuses any chord a browser command already answers — two
handlers on one key would toggle twice and look broken.

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

- `reader.css` holds every static style (fonts, ruler, all the tool chrome) and
  is injected by the browser via the manifest's `content_scripts[].css` — that
  path is exempt from the page's CSP, which a content-script `<style>` is not
  (Firefox blocks it on strict-CSP sites).
- `content.js` runs at `document_start`, sets `data-rc-*` attributes on `<html>`,
  and builds the per-setting `!important` overrides. It pushes those two ways: a
  `<style id="rc-dynamic">` element (instant) *and* a message to the background,
  which applies the same CSS with `chrome.scripting.insertCSS` so it survives
  strict CSP. A small `MutationObserver` re-asserts everything if an SPA wipes
  the `<html>` attributes.
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
- **Strict-CSP sites** (`style-src` without `'unsafe-inline'`) — since 1.5.0 the
  static styles ship as a manifest `content_scripts` stylesheet and the dynamic
  ones go through `chrome.scripting.insertCSS` from the background, both of
  which are CSP-exempt. Verified on a `style-src 'self'` test page. The only
  bit that can still be blocked is the ruler's dim/border colour on the very
  strictest pages (it falls back to a default grey).
- **Runs on all sites, but only after you allow it** — Firefox MV3 (and Chrome
  when the extension is set to "on click") withholds the `<all_urls>` host
  permission until you grant it. The popup shows a red "Allow on all sites"
  banner when that's the case — click it once. Without it, the content script
  simply never runs on the sites you haven't allowed.
- **Some pages can't be touched at all**: browser-internal pages
  (`about:`, `chrome://`), the add-on/extension stores, Chrome's built-in PDF
  viewer, and (by design) content inside cross-origin `<iframe>`s — the script
  only runs in the top frame. On `file://` pages you must tick "Allow access to
  file URLs" in the extension's details.
- **Google Docs / Sheets / canvas-rendered text** — there's no real DOM text to
  restyle or highlight, so the highlighter and dictionary don't work there
  (tint/ruler still do). This is also the main gap on a Chromebook, where
  Docs is often where students actually work; there's no good fix short of
  Docs' own commenting.
- **PDFs** — handled by reopening them in the bundled viewer (see above), not
  by reaching into Chrome's. Consequences: the address bar shows the
  extension's viewer URL, highlights are keyed to that URL, a scanned PDF has
  no text to reflow or highlight, and a PDF behind a login only loads if the
  browser's cookies suffice. PDF.js is stock
  [pdfjs-dist](https://www.npmjs.com/package/pdfjs-dist) 5.6.205, unmodified,
  kept in `pdf/vendor/`; Chrome ships the minified build and Firefox the
  readable one — see `pdf/vendor/README.md`, which also accounts for the
  `DANGEROUS_EVAL` warnings store linters raise against it. Page rendering is
  lazy, so memory tracks the viewport rather than the page count; a page that
  scrolls well clear gives its canvas back, and the page number shows in the
  empty box until it is rendered again.
- **Web components (Shadow DOM)** — text inside a shadow root isn't reached by
  page-level styles, so tint/fonts/spacing may only partly apply on sites built
  heavily from custom elements.
- **Firefox** wasn't run through the automated suite here (no Firefox binary on
  the build box); the Chrome/Edge path is what's verified end-to-end, but the
  1.5.0 CSP fix is specifically for Firefox's stricter behaviour.
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
reader.css         all static styles (CSP-exempt, manifest-injected)
content.js         the reading engine (tint / size / spacing / font / ruler)
highlighter.js     select-to-highlight, persistence, re-anchoring
annotate.js        freehand draw layer, persistence
notes.js           sticky notes
actions.js         the action catalogue + chord parsing, shared by the two below
macros.js          in-page key listener that matches chords and runs actions
background.js      keyboard-command relay + CSP-proof CSS injection
popup.html/.js     the "Aa" control panel
options.html/.js   the settings page: shortcut & macro editor, gesture toggles
fonts/*.woff2      Atkinson Hyperlegible, Lexend, OpenDyslexic (self-hosted)
icons/             generated by make_icons.py (no deps)
build.py           produces per-browser packages in dist/
store/             listing text, publishing steps, screenshots
PRIVACY.md         privacy policy (no data collected)
```
