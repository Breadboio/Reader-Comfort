# Chrome Web Store listing — copy/paste

## Name
Reader Comfort

## Summary (132 chars max)
Make any page or PDF easier to read: tint, dyslexia-friendly fonts, spacing, a ruler, plus highlighting, drawing and sticky notes.

## Category
Accessibility  (secondary: Productivity / Tools)

## Language
English

## Description (store "Detailed description" field)

Reader Comfort turns any web page into a comfortable place to read and study.

READING
• Page tint — cream, blue, mint, peach, or a full dark wash
• Text size, line spacing, and letter/word spacing
• Accessible fonts, bundled in — Atkinson Hyperlegible, Lexend, OpenDyslexic
• Narrow the column to a comfortable line length
• A reading ruler that follows your cursor
• Show italics as bold, underline every link, reduce motion
• Settings apply everywhere, or save a per-site override

MARK UP WHAT YOU READ
• Highlighter — select text, pick a colour; highlights come back when you
  reopen the page. "Quick mode" highlights the moment you select. Optional:
  right-click a highlighted word for its definition.
• Draw / annotate — a freehand layer for arrows, circles, and scribbles right
  on the page
• Sticky notes — drop a resizable note anywhere and it stays put

Everything you mark is saved locally per page and restored on reload.

PDFs
Chrome's built-in PDF viewer is closed to extensions, so the tools normally go
dead on exactly the documents that need them most — worksheets, handouts,
papers. Open a PDF and Reader Comfort offers to reopen it in its own viewer,
where everything works. It has two modes:
• Page view — the PDF as it looks, and you can still select and highlight it
• Reading view — the text pulled out and reflowed as ordinary paragraphs, so
  font, size, spacing and line width finally apply. A fixed PDF layout can't
  do that; this is the difference between a document a struggling reader can
  read and one they can't.

SHARE WHAT YOU MARKED UP
One button saves the page's highlights, notes and drawing as a single
self-contained .html file — your quotes with the text around them, your notes,
and your ink. Send it to anyone. They don't need this extension, or even a
network connection: the file loads nothing and reports nothing.

DICTIONARY (optional)
Turn it on and right-clicking a highlighted word shows its definition. That one
word is sent to the free public api.dictionaryapi.dev — the only network request
the extension ever makes, and it's off unless you enable it.

PRIVATE BY DESIGN
No account. No servers. No analytics. Fonts ship inside the extension. Your
settings and your highlights/notes stay in your own browser. The only thing that
ever leaves your browser is a single word, only when you enable the dictionary.
Full policy: https://github.com/Breadboio/Reader-Comfort/blob/main/PRIVACY.md

KEYBOARD — AND YOUR OWN SHORTCUTS
Alt+R reading ruler · Alt+H quick-highlight · Alt+D draw · Alt+N sticky note
(rebind any of them at chrome://extensions/shortcuts)

A browser only lets an extension claim four keys, so there's a shortcut editor
of its own: open the panel and click "Shortcuts & macros...". Bind any key
combination to any of 80-odd actions — or to a list of them, so one key can go
dark, switch to Hyperlegible and open up the line spacing together. Ready-made
macros for night reading, focus mode and a dyslexia-friendly setup are one
click away. Shortcuts stay quiet while you're typing in a text field.

RULER GESTURES
Triple-click anywhere on the page to show or hide the reading ruler, and hold
Alt+Shift while you scroll to change its height without reaching for the panel.
You can switch that to Alt or Ctrl+Alt if your system already uses it for
something else, or turn either gesture off if they get in your way.

Open source: https://github.com/Breadboio/Reader-Comfort

## Permission justifications (store review form)

storage
  Saves your reading preferences and the highlights, annotations, and notes you
  create. Nothing is sent anywhere.

host permission / <all_urls>  ("Read and change all your data on all websites")
  The reading tools, highlighter, drawing layer, and sticky notes have to work
  on whatever page the user is reading, so the content script must be able to
  run on any site. It only restyles and annotates the current page locally.

host permission / https://api.dictionaryapi.dev/*
  The optional "right-click a highlighted word for its definition" feature
  fetches that one word's definition from this free public dictionary API.
  Off by default; the popup explains it before you enable it.

activeTab
  Lets the toolbar popup send commands (e.g. "add a note", "toggle the ruler")
  to the tab it was opened from.

clipboardWrite
  Powers the "Copy all highlights" button in the popup.

remote code
  None. All code is contained in the package. No external scripts are loaded.
  The PDF viewer bundles Mozilla's PDF.js (pdfjs-dist 5.6.205, unmodified,
  in pdf/). Automated scanners flag eval-like constructs inside that vendored
  bundle; the viewer initialises it with isEvalSupported:false, so those code
  paths are never taken. The upstream source is at
  https://www.npmjs.com/package/pdfjs-dist/v/5.6.205 for byte comparison.

data usage disclosures (check on the form)
  ☑ Does NOT sell or transfer user data to third parties
  ☑ Does NOT use or transfer data for purposes unrelated to the item's core functionality
  ☑ Does NOT use or transfer data to determine creditworthiness / for lending
  The extension stores data only in the browser's own storage. The one thing it
  can transmit is a single dictionary-lookup word to api.dictionaryapi.dev, and
  only when the user has switched that feature on. If the form asks what data is
  handled, disclose "Website content" (the looked-up word) — used only to
  provide the definition the user asked for, not collected by the developer, not
  sold, not shared beyond that API call.

## Screenshots (store wants 1280x800 or 640x400, PNG) — all 1280x800
store/screenshots/1-reading-comfort.png   — cream tint, Hyperlegible, airy spacing, narrow column
store/screenshots/2-highlighter.png       — three colour highlights on an article
store/screenshots/3-notes-and-ink.png     — sticky note + circled passage + highlights together
store/screenshots/4-pdf-reading-view.png  — a PDF reflowed into OpenDyslexic (the standout one)
store/screenshots/5-the-panel.png         — the popup, captioned

Regenerate them with the scripts under the scratch dir used in development:
they drive a real Chromium with the extension loaded, so they always show the
current UI rather than a mockup.

## Small promo tile (440x280) — optional but recommended
Not generated. Make one from icon128 on a cream background, or skip (only
required for the store's featured collections).
