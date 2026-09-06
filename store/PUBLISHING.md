# Publishing Reader Comfort

## Build the packages

```
python3 build.py
```

Produces:
- `dist/reader-comfort-chrome-<version>.zip`  → Chrome Web Store + Edge Add-ons
- `dist/reader-comfort-firefox-<version>.zip` → addons.mozilla.org

The source `manifest.json` carries keys for both engines; `build.py` splits it
(Chrome gets `background.service_worker`, Firefox gets `background.scripts` +
`browser_specific_settings`).

It also picks the PDF.js flavour per store, from the one upstream release in
`pdf/vendor/`: Chrome gets the minified build (smaller and faster to parse,
which is what a Chromebook cares about), Firefox gets the readable one (AMO
reviews by hand). See `pdf/vendor/README.md`.

---

## Chrome Web Store

**Everything that can be prepared ahead of time is done** — package builds
clean, listing copy is written and within the field limits, and all five
screenshots are 1280x800 and current. What's left needs a human with the
Google account:

- [ ] Register as a developer and pay the one-time **$5 USD** fee
- [ ] Upload `dist/reader-comfort-chrome-<version>.zip`
- [ ] Paste the listing fields from `store/LISTING.md`
- [ ] Upload the five PNGs from `store/screenshots/`
- [ ] Fill the Privacy tab (text below)
- [ ] Submit

### One-time setup
1. Go to <https://chromewebstore.google.com/devconsole> and sign in with the
   Google account that should own the listing.
2. Pay the **one-time $5 USD** developer registration fee.
3. Verify a contact email.

### Submit
1. **New item** → upload `dist/reader-comfort-chrome-<version>.zip`.
2. Fill the listing from `store/LISTING.md` (name, summary, description,
   category = Accessibility).
3. Upload the 4 screenshots from `store/screenshots/`.
4. Graphics: 128×128 icon is in the package. A 440×280 promo tile is optional.
5. **Privacy tab:**
   - Single purpose: *"Reading-comfort tools (tint, fonts, spacing, ruler) plus
     a highlighter, freehand annotations, and sticky notes for any web page."*
   - Permission justifications: copy from `store/LISTING.md`.
   - Host permission justification: same file.
   - Remote code: **No, I am not using remote code.**
   - Data usage: check the three "does not sell / does not transfer" boxes.
     Settings, highlights, notes and ink stay in browser storage. The one
     exception to "no network requests" is the **opt-in dictionary**, off by
     default: with it on, a right-click on a highlighted word sends that
     single word to `api.dictionaryapi.dev`. Say so rather than claiming
     nothing is sent — `PRIVACY.md` and `store/LISTING.md` both disclose it,
     and a contradicting privacy tab is the kind of thing review catches.
   - Privacy policy URL:
     `https://github.com/Breadboio/Reader-Comfort/blob/main/PRIVACY.md`
     (or host it on breadtoasting.com and use that URL).
6. Distribution: **Public**, all regions.
7. Submit for review. Broad host permissions (`<all_urls>`) usually mean a
   few days of review rather than hours.

### Validator warnings
The 1.6.0 upload came back with six warnings; **all six are closed as of
1.8.1**. Two `strict_min_version` ones and the Android `permissions.request`
one were fixed in 1.6.1 (140 desktop / 142 Android); the three
`UNSAFE_VAR_ASSIGNMENT` ones were fixed in 1.8.1 by building toolbar and popup
markup as DOM nodes instead of `innerHTML` strings.

What remains is five warnings inside the vendored PDF.js bundle
(`DANGEROUS_EVAL` / `UNSAFE_VAR_ASSIGNMENT` on its `new Function` use). Those
are stock Mozilla code and are expected — see the note below. Re-check before
each upload with:

```
npx addons-linter --output=json build/firefox
```

### Expect
- Review may ask why `<all_urls>` is needed — the justification text already
  answers it (the tools must run on any page the user reads).
- Review may flag **eval inside `pdf/pdf.worker.mjs`** (5 warnings). That is
  stock Mozilla PDF.js 5.6.205, vendored unmodified. Firefox ships the
  *non-minified* build precisely so a reviewer can read it, and
  `pdf/vendor/README.md` names each warning line by line, with the upstream
  link and SHA256s for byte comparison. The short version: two are a
  `new Function("")` feature probe that detects eval being *unavailable*, one
  is behind the `isEvalSupported: false` the viewer sets, and two are PDF.js
  importing its own worker.
- If they push back, the fallback is `activeTab` + `optional_host_permissions`,
  but that makes the extension only activate after a click on every site, which
  hurts the reading-tools experience. Try the `<all_urls>` justification first.

---

## Microsoft Edge Add-ons (same package, free)
<https://partner.microsoft.com/dashboard/microsoftedge> — no fee. Upload the
same `reader-comfort-chrome-<version>.zip`, reuse the listing text.

---

## Firefox (addons.mozilla.org)
1. <https://addons.mozilla.org/developers/> — free account.
2. Submit `dist/reader-comfort-firefox-<version>.zip`.
3. Choose "On this site" (listed) or "On your own" (self-distributed, still
   signed).
4. AMO auto-signs; source-code upload may be requested because the review is
   done by humans — the repo is public, so point them at it or attach a tarball.
5. Once listed, it also installs on **Firefox for Android**.

---

## Version bumps
1. Edit `version` in `manifest.json`.
2. `python3 build.py`
3. `git commit`, `git tag vX.Y.Z`, `git push --tags`
4. `gh release create vX.Y.Z --notes-file <notes>`
5. Upload the new zips to each store (stores require a strictly higher version).
