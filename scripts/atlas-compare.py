#!/usr/bin/env python3
"""Side-by-side Swift | RN sheets for every mapped atlas id.

  python3 scripts/atlas-compare.py [--rn web|ios] [--theme dark|light] [--components [Name ...]]

Needs Pillow (a venv is fine: python3 -m venv .venv-atlas && .venv-atlas/bin/pip install pillow).
Writes design/atlas/compare/<id>.png and design/atlas/compare/index.html (gitignored).
Swift shots are looked up in the atlas run, lead-qa, uiqa, design/screens/current, then the iPad
atlas (flagged). Dark = ScreenAtlasTests, light = ScreenAtlasPapelTests; RN dark = Indigo, light
= Papel (capture it with `atlas-web.mjs --theme papel`).
"""
import html
import json
import os
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ATLAS = ROOT / "design/atlas"
SWIFT = Path(os.environ.get("SWIFT_REPO") or next(
    (p for p in (ROOT.parent / "Agentico", ROOT.parents[3] / "Agentico") if (p / "docs/ux/screens.yml").exists()),
    ROOT.parent / "Agentico",
))
args = sys.argv[1:]
rn_kind = args[args.index("--rn") + 1] if "--rn" in args else "web"
light = "--theme" in args and args[args.index("--theme") + 1] == "light"
test_class = "ScreenAtlasPapelTests" if light else "ScreenAtlasTests"
suffix = ".papel" if light else ""
HEIGHT = 1400  # each half is scaled to this height


def swift_shot(screen_id):
    """(path, label) of the best Swift screenshot, or None."""
    review = SWIFT / "build/ui-review"
    for run in ("atlas", "lead-qa", "uiqa"):
        found = sorted((review / run / "screenshots" / test_class).glob(f"*/{screen_id}.png"))
        if found:
            return found[0], f"Swift ({run})"
    current = SWIFT / "design/screens/current" / f"{screen_id}.png"
    if current.exists() and not light:
        return current, "Swift (design/screens/current)"
    found = sorted((review / "atlas-pad/screenshots" / test_class).glob(f"*/{screen_id}.png"))
    if found:
        return found[0], "Swift (iPad atlas)"
    return None


def fit(path, label):
    image = Image.open(path).convert("RGB")
    width = round(image.width * HEIGHT / image.height)
    image = image.resize((width, HEIGHT), Image.LANCZOS)
    canvas = Image.new("RGB", (width, HEIGHT + 60), (40, 40, 40))
    canvas.paste(image, (0, 60))
    ImageDraw.Draw(canvas).text((16, 20), label, fill=(255, 255, 255))
    return canvas


def sheet(left, right):
    out = Image.new("RGB", (left.width + right.width + 24, left.height), (90, 90, 90))
    out.paste(left, (0, 0))
    out.paste(right, (left.width + 24, 0))
    return out


def components_mode():
    """Swift crop | RN Indigo | RN Papel per catalog key -> design/atlas/components/compare/<key>.png.

    Crops come from docs/ux/components/ref (scripts/ux-crop.py), RN captures from
    design/atlas/components/rn-web (scripts/ux-components.mjs, with the component rect in a .json).
    """
    ref_dir = ROOT / "docs/ux/components/ref"
    rn_dir = ATLAS / "components/rn-web"
    out = ATLAS / "components/compare"
    out.mkdir(parents=True, exist_ok=True)
    scale = 3  # the atlas crops are 1x, the web captures 3x
    only = [a for a in args if not a.startswith("--") and a not in ("web", "ios", "dark", "light")]
    rows = []

    def rn_crop(key, theme_suffix):
        png = rn_dir / f"{key}{theme_suffix}.png"
        meta = rn_dir / f"{key}{theme_suffix}.json"
        if not png.exists() or not meta.exists():
            return None
        rect = json.loads(meta.read_text())
        image = Image.open(png).convert("RGB")
        box = (int(rect["x"] * scale), int(rect["y"] * scale), int((rect["x"] + rect["width"]) * scale), int((rect["y"] + rect["height"]) * scale))
        return image.crop(box)

    def labeled(image, label, height):
        width = round(image.width * height / image.height)
        canvas = Image.new("RGB", (width, height + 30), (40, 40, 40))
        canvas.paste(image.resize((width, height), Image.LANCZOS), (0, 30))
        ImageDraw.Draw(canvas).text((8, 8), label, fill=(255, 255, 255))
        return canvas

    crops = json.loads((ROOT / "docs/ux/components/crops.json").read_text())["crops"]
    for key in crops:
        if only and key not in only and key.split(".")[0] not in only:
            continue
        ref = ref_dir / (f"{key}.light.png" if light else f"{key}.png")
        if not ref.exists():
            continue
        indigo, papel = rn_crop(key, ""), rn_crop(key, ".papel")
        if indigo is None and papel is None:
            rows.append((key, "no RN capture"))
            continue
        swift = Image.open(ref).convert("RGB")
        height = max(240, swift.height * scale)
        parts = [labeled(swift, f"Swift {'Papel' if light else 'dark'} (ref/{key})", height)]
        parts += [labeled(im, label, height) for im, label in ((indigo, "RN Indigo"), (papel, "RN Papel")) if im is not None]
        sheet_image = Image.new("RGB", (sum(p.width for p in parts) + 16 * (len(parts) - 1), height + 30), (90, 90, 90))
        x = 0
        for part in parts:
            sheet_image.paste(part, (x, 0))
            x += part.width + 16
        sheet_image.save(out / f"{key}.png")
        rows.append((key, "ok"))
    cells = "".join(f'<figure><figcaption>{html.escape(k)}</figcaption><img loading="lazy" src="{html.escape(k)}.png"></figure>' for k, s in rows if s == "ok")
    (out / "index.html").write_text(
        "<!doctype html><meta charset=utf-8><title>UX components</title>"
        "<style>body{font:14px system-ui;background:#222;color:#eee;margin:16px}figure{margin:0 0 32px}img{max-width:100%}</style>"
        f"<h1>Swift crop | RN Indigo | RN Papel</h1>{cells}"
    )
    for key, status in rows:
        print(f"{status:14} {key}")
    print(f"{sum(1 for _, s in rows if s == 'ok')} sheets in design/atlas/components/compare")


if "--components" in args:
    components_mode()
    sys.exit(0)

mapped = json.loads((ROOT / "apps/mobile/src/dev/atlas/atlasMap.json").read_text())
swift_ids = re.findall(r"^  ([a-z-]+\.[a-z0-9-]+):$", (SWIFT / "docs/ux/screens.yml").read_text(), re.M)
out_dir = ATLAS / "compare"
out_dir.mkdir(parents=True, exist_ok=True)
rows = []
for entry in mapped:
    screen_id = entry["id"]
    rn = ATLAS / f"rn-{rn_kind}" / f"{screen_id}{suffix}.png"
    swift = swift_shot(screen_id)
    status = "ok"
    if not rn.exists():
        status = "no RN capture"
    elif swift is None:
        status = "no Swift shot"
        fit(rn, f"RN {rn_kind} only").save(out_dir / f"{screen_id}{suffix}.png")
    else:
        sheet(fit(swift[0], swift[1]), fit(rn, f"RN ({rn_kind})")).save(out_dir / f"{screen_id}{suffix}.png")
    rows.append((screen_id, status, entry.get("note", "")))

mapped_ids = {entry["id"] for entry in mapped}
unmapped = [i for i in swift_ids if i not in mapped_ids]
cells = "".join(
    f'<figure><figcaption>{html.escape(i)} <small>{html.escape(s)} {html.escape(n)}</small></figcaption>'
    f'<img loading="lazy" src="{html.escape(i)}{suffix}.png"></figure>'
    for i, s, n in rows if s != "no RN capture"
)
missing = "".join(f"<li>{html.escape(i)}</li>" for i in unmapped)
(out_dir / "index.html").write_text(
    "<!doctype html><meta charset=utf-8><title>UX atlas</title>"
    "<style>body{font:14px system-ui;background:#222;color:#eee;margin:16px}figure{margin:0 0 32px}"
    "img{max-width:100%}small{color:#999}ul{columns:3}</style>"
    f"<h1>Swift | RN ({'light' if light else 'dark'})</h1>{cells}"
    f"<h2>Swift ids with no RN screen yet ({len(unmapped)})</h2><ul>{missing}</ul>"
)
(out_dir / "unmapped.txt").write_text("\n".join(unmapped) + "\n")
for screen_id, status, _ in rows:
    print(f"{status:14} {screen_id}")
print(f"{len(unmapped)} Swift ids have no RN screen (design/atlas/compare/unmapped.txt)")
