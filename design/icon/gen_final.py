"""Generates every app icon asset from the mark's one definition (packages/ui/tokens/mark.json).

    python3 -I gen_final.py [ANGLE] [--finish metal|flat]

Run from design/icon (Chrome headless renders the SVGs). ANGLE is the fan angle (default: the
token's). `metal` (default) is the approved finish: dark metal pieces with a rim of light;
`flat` reproduces the previous white and grey finish. Both SVG sources are always written; the
PNGs, the previews and the copies under apps/mobile/assets/images follow the chosen finish.
"""
import json, math, pathlib, shutil, subprocess, sys, tempfile

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
HERE = pathlib.Path(__file__).resolve().parent
TOKENS = json.loads((HERE / "../../packages/ui/tokens/mark.json").read_text())
APP_IMAGES = HERE / "../../apps/mobile/assets/images"
G = TOKENS["geometry"]

args = [a for a in sys.argv[1:] if not a.startswith("--")]
FINISH = sys.argv[sys.argv.index("--finish") + 1] if "--finish" in sys.argv else "metal"
if FINISH in args: args.remove(FINISH)
if FINISH not in ("metal", "flat"): sys.exit(f"unknown finish {FINISH}")
ANG = float(args[0]) if args else G["fanAngle"]

BLACK = TOKENS["background"]
GAP = G["gap"]
C = G["card"]
PIVX, PIVY = G["pivot"]
POCKET = G["pocket"]
# (angle, piece) back to front; front card last
CARDS = [(-ANG, "left"), (ANG, "right"), (0, "center")]


def card(a, attrs=""):
    return (f'<rect {attrs} x="{C["x"]}" y="{C["y"]}" width="{C["width"]}" height="{C["height"]}" '
            f'rx="{C["rx"]}" transform="rotate({a} {PIVX} {PIVY})"/>')


def bbox():
    pts = [(222, 650), (802, 650), (222, 820), (802, 820)]
    for a, _ in CARDS:
        for x, y in ((C["x"], C["y"]), (C["x"] + C["width"], C["y"])):
            r = math.radians(a); dx, dy = x - PIVX, y - PIVY
            pts.append((PIVX + dx * math.cos(r) - dy * math.sin(r), PIVY + dx * math.sin(r) + dy * math.cos(r)))
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return min(xs), max(xs), min(ys), max(ys)


X0, X1, Y0, Y1 = bbox(); CX, CY = (X0 + X1) / 2, (Y0 + Y1) / 2
RMAX = max(math.hypot(x - CX, y - CY) for x, y in [(X0, Y0), (X1, Y0), (X0, Y1), (X1, Y1)])
KNOCK = f'fill="#000" stroke="#000" stroke-width="{GAP * 2}" stroke-linejoin="round"'


def masks(uid):
    """A mask per card: the pieces in front of it, grown by the gap, are cut out (real gaps)."""
    defs = ""
    for i in range(len(CARDS)):
        front = "".join(card(b, KNOCK) for b, _ in CARDS[i + 1:])
        front += f'<path d="{POCKET}" {KNOCK}/>'
        defs += (f'<mask id="{uid}{i}" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">'
                 f'<rect width="1024" height="1024" fill="#fff"/>{front}</mask>')
    return defs


def vertical(gid, stops):
    s = "".join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>' for o, c, a in stops)
    return f'<linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="1">{s}</linearGradient>'


def mark_flat(cardfill, pocketfill, opac=True, uid="m"):
    """The flat finish: white cards at stepped opacity over a grey pocket."""
    flat = TOKENS["flat"]
    body = ""
    for i, (a, _) in enumerate(CARDS):
        o = flat["cardOpacity"][i] if opac else 1
        body += f'<g mask="url(#{uid}{i})"><g fill="{cardfill}" fill-opacity="{o}">{card(a)}</g></g>'
    body += f'<path d="{POCKET}" fill="{pocketfill}"/>'
    return masks(uid), body


def mark_metal(uid="t"):
    """The approved finish: each piece a dark metal gradient with a rim of light along its top."""
    rim = TOKENS["rim"]
    defs = masks(uid)
    defs += vertical(f"{uid}rim", [(s["offset"], rim["color"], s["opacity"]) for s in rim["stops"]])
    for name, (top, bottom) in TOKENS["metal"].items():
        defs += vertical(f"{uid}{name}", [(0, top, 1), (1, bottom, 1)])
    stroke = f'fill="none" stroke="url(#{uid}rim)" stroke-width="{G["rimWidth"]}"'
    body = ""
    for i, (a, name) in enumerate(CARDS):
        body += f'<g mask="url(#{uid}{i})">{card(a, f"fill=\"url(#{uid}{name})\"")}{card(a, stroke)}</g>'
    body += f'<path d="{POCKET}" fill="url(#{uid}pocket)"/><path d="{POCKET}" {stroke}/>'
    return defs, body


def wrap(inner, defs, scale=1.0, bg=""):
    t = f"translate(512 512) scale({scale}) translate({-CX} {-CY})"
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">'
            f"<title>OpenAgentsPocket</title><defs>{defs}</defs>{bg}<g transform=\"{t}\">{inner}</g></svg>")


def shot(svg, out, size, mask=False, transparent=False):
    p = pathlib.Path(tempfile.mktemp(suffix=".svg")); p.write_text(svg)
    clear = transparent or mask
    rad = f"border-radius:{size * .2237}px;" if mask else ""
    html = (f'<html><body style="margin:0;background:{"transparent" if clear else "#fff"}">'
            f'<img src="{p.as_uri()}" style="width:{size}px;height:{size}px;{rad}display:block"></body></html>')
    q = pathlib.Path(tempfile.mktemp(suffix=".html")); q.write_text(html)
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    "--default-background-color=" + ("00000000" if clear else "FFFFFFFF"),
                    f"--window-size={size},{size}", f"--screenshot={out}", q.as_uri()],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def assert_opaque(path):
    """The iOS icon must not carry an alpha channel (App Store rule); Chrome writes an opaque page as RGB."""
    info = subprocess.run(["sips", "-g", "hasAlpha", str(path)], check=True, capture_output=True, text=True).stdout
    if "hasAlpha: no" not in info: sys.exit(f"{path.name} has an alpha channel")


out = HERE
BG = f'<rect width="1024" height="1024" fill="{BLACK}"/>'
sc_icon = 0.68 * 1024 / (X1 - X0)          # mark width ~ 68% of the canvas
sc_fg = 338 * 0.97 / RMAX                    # inside the adaptive icon's 66% safe circle (diameter 676)

flat = mark_flat(TOKENS["flat"]["card"], TOKENS["flat"]["pocket"])
metal = mark_metal()
(out / "icon-flat.svg").write_text(wrap(flat[1], flat[0], sc_icon, BG))
(out / "icon-metal.svg").write_text(wrap(metal[1], metal[0], sc_icon, BG))
d, b = metal if FINISH == "metal" else flat

icon = wrap(b, d, sc_icon, BG)
shot(icon, out / "ios-icon-1024.png", 1024)   # opaque, unmasked (iOS applies the mask)
assert_opaque(out / "ios-icon-1024.png")
for s in (180, 60, 29): shot(icon, out / f"preview-{s}.png", s, mask=True)
fg = wrap(b, d, sc_fg)
(out / "android-foreground.svg").write_text(fg)
shot(fg, out / "android-foreground-1024.png", 1024, transparent=True)
shot(f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="{BLACK}"/></svg>',
     out / "android-background-1024.png", 1024)
assert_opaque(out / "android-background-1024.png")
dm, bm = mark_flat("#000", "#000", opac=False, uid="k")   # themed icon: one silhouette, gaps kept
shot(wrap(bm, dm, sc_fg), out / "android-monochrome-1024.png", 1024, transparent=True)
shot(icon, out / "favicon-48.png", 48, mask=True)


def row(bg):
    imgs = "".join(f'<img src="{(out / f"preview-{s}.png").as_uri()}" width="{s}">' for s in (180, 60, 29))
    return f'<div style="background:{bg};padding:10px;display:flex;gap:14px;align-items:center">{imgs}</div>'


contact = out / "c.html"
contact.write_text('<body style="margin:0;display:flex">' + row("#e8e8ee") + row("#000"))
subprocess.run([CHROME, "--headless=new", "--hide-scrollbars", "--window-size=760,210",
                f"--screenshot={out / 'contact.png'}", contact.as_uri()],
               check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
contact.unlink()
assert_opaque(out / "contact.png")

# The app's copies: same pixels, the names app.json uses.
for src, dst in [("ios-icon-1024.png", "icon.png"), ("android-foreground-1024.png", "android-icon-foreground.png"),
                 ("android-background-1024.png", "android-icon-background.png"),
                 ("android-monochrome-1024.png", "android-icon-monochrome.png"), ("favicon-48.png", "favicon.png")]:
    shutil.copyfile(out / src, APP_IMAGES / dst)
print(FINISH, ANG, round(RMAX, 1), round(X1 - X0, 1))
