#!/usr/bin/env python3
"""Regenerates the Swift reference crops of docs/ux/components/ref from the Swift atlas.

  python3 scripts/ux-crop.py [--only Name ...] [--sheet out.png]

Reads docs/ux/components/crops.json (component[.variant] -> atlas file + box). Dark crops come
from <swift>/design/screens/current (or its ipad/ folder), light ones (light=true) from
<swift>/design/screens/current/light with the same box. Writes ref/<key>.png and ref/<key>.light.png
at 1x. --sheet also writes a contact sheet to eyeball the boxes. Needs Pillow
(python3 -m venv V && V/bin/pip install pillow).
"""
import json
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SWIFT = Path(os.environ.get("SWIFT_REPO") or next(
    (p for p in (ROOT.parent / "Agentico", ROOT.parents[3] / "Agentico") if (p / "docs/ux/screens.yml").exists()),
    ROOT.parent / "Agentico",
))
ATLAS = SWIFT / "design/screens/current"
OUT = ROOT / "docs/ux/components/ref"
crops = json.loads((ROOT / "docs/ux/components/crops.json").read_text())["crops"]

args = sys.argv[1:]
only = []
sheet = None
i = 0
while i < len(args):
    if args[i] == "--sheet":
        sheet = Path(args[i + 1])
        i += 2
    elif args[i] == "--only":
        i += 1
        while i < len(args) and not args[i].startswith("--"):
            only.append(args[i])
            i += 1
    else:
        i += 1

OUT.mkdir(parents=True, exist_ok=True)
written = []
for key, spec in crops.items():
    if only and key.split(".")[0] not in only and key not in only:
        continue
    folder = ATLAS / "ipad" if spec.get("ipad") else ATLAS
    variants = [("", folder)] + ([(".light", ATLAS / "light")] if spec.get("light") else [])
    for suffix, base in variants:
        src = base / f"{spec['src']}.png"
        if not src.exists():
            print(f"SKIP {key}{suffix}: missing {src.relative_to(SWIFT)}")
            continue
        image = Image.open(src).convert("RGB")
        x0, y0, x1, y1 = spec["box"]
        if x1 > image.width or y1 > image.height:
            print(f"WARN {key}{suffix}: box outside {image.width}x{image.height}")
        target = OUT / f"{key}{suffix}.png"
        image.crop((x0, y0, min(x1, image.width), min(y1, image.height))).save(target, optimize=True)
        written.append(target)
print(f"{len(written)} crops written to {OUT.relative_to(ROOT)}")

if sheet and written:
    thumbs = []
    for path in sorted(written):
        image = Image.open(path)
        scale = min(1.0, 380 / image.width, 240 / image.height)
        image = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))))
        tile = Image.new("RGB", (390, image.height + 16), (60, 60, 60))
        tile.paste(image, (5, 14))
        ImageDraw.Draw(tile).text((5, 1), path.stem, fill=(255, 255, 0))
        thumbs.append(tile)
    columns = 4
    rows = [thumbs[n:n + columns] for n in range(0, len(thumbs), columns)]
    page = Image.new("RGB", (columns * 396, sum(max(t.height for t in row) + 6 for row in rows)), (30, 30, 30))
    y = 0
    for row in rows:
        for column, tile in enumerate(row):
            page.paste(tile, (column * 396, y))
        y += max(t.height for t in row) + 6
    page.save(sheet)
    print(f"sheet {sheet}")
