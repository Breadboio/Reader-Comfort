#!/usr/bin/env python3
"""Generate Reader Comfort toolbar icons (no external deps)."""
import struct, zlib, os

CREAM = (0xFA, 0xF3, 0xE3)
INK   = (0x2B, 0x27, 0x21)
GOLD  = (0x8A, 0x61, 0x00)
RULE  = (0xDF, 0xD3, 0xB8)

def px(x, y, n):
    fx, fy = x / n, y / n
    # rounded-square background
    r = 0.14
    inside = True
    for cx, cy in ((r, r), (1 - r, r), (r, 1 - r), (1 - r, 1 - r)):
        if ((fx < r and fy < r) or (fx > 1 - r and fy < r) or
            (fx < r and fy > 1 - r) or (fx > 1 - r and fy > 1 - r)):
            if (fx - cx) ** 2 + (fy - cy) ** 2 > r * r:
                inside = False
    if not inside:
        return None  # transparent
    # text lines
    lines = [0.20, 0.33, 0.46, 0.68, 0.81]
    for i, ly in enumerate(lines):
        w = 0.60 if i not in (2, 4) else 0.42
        if ly <= fy <= ly + 0.075 and 0.19 <= fx <= 0.19 + w:
            return INK
    # reading-ruler band
    if 0.545 <= fy <= 0.62:
        return GOLD
    if 0.535 <= fy <= 0.63:
        return RULE
    return CREAM

def make(n):
    raw = bytearray()
    for y in range(n):
        raw.append(0)
        for x in range(n):
            c = px(x, y, n)
            if c is None:
                raw += bytes((0, 0, 0, 0))
            else:
                raw += bytes((c[0], c[1], c[2], 255))
    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", n, n, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), 9)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")

here = os.path.join(os.path.dirname(__file__), "icons")
os.makedirs(here, exist_ok=True)
for n in (16, 32, 48, 128):
    with open(os.path.join(here, f"icon{n}.png"), "wb") as f:
        f.write(make(n))
    print("wrote icons/icon%d.png" % n)
