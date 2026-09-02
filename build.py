#!/usr/bin/env python3
"""Build per-browser packages of Reader Comfort.

    python3 build.py            # build ./build/{chrome,firefox} + ./dist/*.zip
    python3 build.py --chrome   # just chrome
    python3 build.py --firefox  # just firefox

The one source manifest carries keys for both engines. This script splits it:
  - Chrome build:  drop `browser_specific_settings` and `background.scripts`
  - Firefox build: drop `background.service_worker`
No other files change between targets.
"""
import json, sys, shutil, zipfile
from pathlib import Path

ROOT = Path(__file__).parent
BUILD = ROOT / "build"
DIST = ROOT / "dist"

# everything the extension needs at runtime
INCLUDE = [
    "content.js", "highlighter.js", "annotate.js", "notes.js",
    "background.js", "reader.css", "popup.html", "popup.js",
    "icons", "fonts",
]

def load_manifest():
    return json.loads((ROOT / "manifest.json").read_text())

def chrome_manifest(m):
    m = json.loads(json.dumps(m))
    m.pop("browser_specific_settings", None)
    if "background" in m:
        m["background"].pop("scripts", None)
    return m

def firefox_manifest(m):
    m = json.loads(json.dumps(m))
    if "background" in m:
        m["background"].pop("service_worker", None)
    return m

def stage(target, manifest):
    out = BUILD / target
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    for name in INCLUDE:
        src = ROOT / name
        if not src.exists():
            raise SystemExit(f"missing: {name}")
        if src.is_dir():
            shutil.copytree(src, out / name, ignore=shutil.ignore_patterns("README.md"))
        else:
            shutil.copy2(src, out / name)
    return out

def zip_dir(folder, zip_path):
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(folder.rglob("*")):
            if p.is_file():
                z.write(p, p.relative_to(folder))
    return zip_path

def main():
    args = sys.argv[1:]
    targets = []
    if not args or "--chrome" in args:
        targets.append("chrome")
    if not args or "--firefox" in args:
        targets.append("firefox")

    m = load_manifest()
    ver = m["version"]
    makers = {"chrome": chrome_manifest, "firefox": firefox_manifest}
    for t in targets:
        folder = stage(t, makers[t](m))
        zp = zip_dir(folder, DIST / f"reader-comfort-{t}-{ver}.zip")
        size = zp.stat().st_size
        print(f"{t:8}  {folder.relative_to(ROOT)}/   ->  {zp.relative_to(ROOT)}  ({size/1024:.0f} KB)")

if __name__ == "__main__":
    main()
