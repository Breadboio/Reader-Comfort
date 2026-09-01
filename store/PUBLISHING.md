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

---

## Chrome Web Store

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
     The extension stores data only in browser storage and makes no network
     requests, so nothing is "collected."
   - Privacy policy URL:
     `https://github.com/Breadboio/Reader-Comfort/blob/main/PRIVACY.md`
     (or host it on breadtoasting.com and use that URL).
6. Distribution: **Public**, all regions.
7. Submit for review. Broad host permissions (`<all_urls>`) usually mean a
   few days of review rather than hours.

### Expect
- Review may ask why `<all_urls>` is needed — the justification text already
  answers it (the tools must run on any page the user reads).
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
