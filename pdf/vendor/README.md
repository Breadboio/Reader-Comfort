# Vendored PDF.js

Stock **PDF.js 5.6.205** (`pdfjsBuild ada343803`), unmodified, from Mozilla.
Both flavours of the same upstream release are kept here; `build.py` copies one
pair into each package as `pdf/pdf.mjs` + `pdf/pdf.worker.mjs`, which is what
`pdf/viewer.js` imports.

| file | goes to | why |
|---|---|---|
| `pdf.min.mjs`, `pdf.worker.min.mjs` | Chrome / Edge | 1.6 MB instead of 3.0 MB. Chromebooks are the thin end of that audience and it is a straight parse-time and disk win. |
| `pdf.mjs`, `pdf.worker.mjs` | Firefox (AMO) | AMO is reviewed by hand and treats minified code as something to demand sources for. Shipping the readable build means the question never comes up. |

Byte-comparable against upstream:

- <https://github.com/mozilla/pdf.js/releases/tag/v5.6.205>
- <https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.6.205/pdf.mjs> (and
  `pdf.worker.mjs`, `pdf.min.mjs`, `pdf.worker.min.mjs`)

`SHA256SUMS` records what is here. Apache-2.0, © Mozilla Foundation.

## Re-vendoring

```
cd pdf/vendor
for f in pdf.mjs pdf.worker.mjs pdf.min.mjs pdf.worker.min.mjs; do
  curl -4 -sSL -o "$f" "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/<version>/$f"
done
sha256sum *.mjs > SHA256SUMS
```

Then re-run `python3 build.py` and re-check with `addons-linter build/firefox`.

## The eval warnings

`addons-linter` reports 5 warnings here and they do not go away with the
readable build, because they are in PDF.js itself. They are:

- `pdf.mjs:508` / `pdf.worker.mjs:508` — `new Function("")` inside
  `isEvalSupported()`. A feature probe in a `try/catch` whose whole job is to
  discover that eval is *unavailable*. It compiles an empty string and
  evaluates no content, ever.
- `pdf.worker.mjs:31815` — `new Function(...)` in the PostScript function
  compiler, guarded by `factory.isEvalSupported && FeatureTest.isEvalSupported`.
  `pdf/viewer.js` passes `isEvalSupported: false` to `getDocument()`, so this
  branch is dead in our build; it falls through to the interpreter.
- Two `UNSAFE_VAR_ASSIGNMENT` "unsafe call to import" — PDF.js dynamically
  importing its own worker module by URL.

None is reachable with attacker-controlled input. If a reviewer asks, point at
the upstream release above for byte comparison.
