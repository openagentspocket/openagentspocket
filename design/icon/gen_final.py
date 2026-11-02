import math, subprocess, pathlib, tempfile, sys
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
D="#0B0820"; W="#F6F6FC"
GAP=26
ANG=float(sys.argv[1]) if len(sys.argv)>1 else 26
CW,CH_,PIV=(270,520,790)
# (angle, opacity) back to front; front card last
CARDS=[(-ANG,.55),(ANG,.8),(0,1)]
POCKET='M222 690 Q222 650 262 650 H762 Q802 650 802 690 V725 A95 95 0 0 1 707 820 H317 A95 95 0 0 1 222 725 Z'
def card(a): return f'<rect x="{512-CW/2}" y="{PIV-CH_}" width="{CW}" height="{CH_}" rx="64" transform="rotate({a} 512 {PIV})"/>'
def bbox():
    pts=[(222,650),(802,650),(222,820),(802,820)]
    for a,_ in CARDS:
        for x,y in((512-CW/2,PIV-CH_),(512+CW/2,PIV-CH_)):
            r=math.radians(a);dx,dy=x-512,y-PIV
            pts.append((512+dx*math.cos(r)-dy*math.sin(r),PIV+dx*math.sin(r)+dy*math.cos(r)))
    xs=[p[0] for p in pts];ys=[p[1] for p in pts]
    return min(xs),max(xs),min(ys),max(ys)
X0,X1,Y0,Y1=bbox();CX,CY=(X0+X1)/2,(Y0+Y1)/2
RMAX=max(math.hypot(x-CX,y-CY) for x,y in [(X0,Y0),(X1,Y0),(X0,Y1),(X1,Y1)])
def mark(cardfill,pocketfill,opac=True,uid="m"):
    """Mark in 1024 space, centered; gaps carved with masks so it works on any background."""
    defs="";body=""
    for i,(a,o) in enumerate(CARDS):
        front="".join(f'<g transform="" >{card(b).replace("<rect","<rect fill=\"#000\" stroke=\"#000\" stroke-width=\"%d\""%(GAP*2))}</g>' for b,_ in CARDS[i+1:])
        front+=f'<path d="{POCKET}" fill="#000" stroke="#000" stroke-width="{GAP*2}" stroke-linejoin="round"/>'
        defs+=f'<mask id="{uid}{i}" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><rect width="1024" height="1024" fill="#fff"/>{front}</mask>'
        body+=f'<g mask="url(#{uid}{i})"><g fill="{cardfill}" fill-opacity="{o if opac else 1}">{card(a)}</g></g>'
    body+=f'<path d="{POCKET}" fill="{pocketfill}"/>'
    return defs,body
def wrap(inner,defs,scale=1.0,tx=0,ty=0,bg=""):
    t=f'translate({512+tx} {512+ty}) scale({scale}) translate({-CX} {-CY})'
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9C8CFF"/><stop offset="1" stop-color="#8270F5"/></linearGradient>{defs}</defs>{bg}<g transform="{t}">{inner}</g></svg>'
BG='<rect width="1024" height="1024" fill="url(#bg)"/>'
def shot(svg,out,size,mask=False,transparent=False,w=None,h=None):
    w=w or size;h=h or size
    p=pathlib.Path(tempfile.mktemp(suffix=".svg"));p.write_text(svg)
    rad=f"border-radius:{w*.2237}px;" if mask else ""
    html=f'<html><body style="margin:0;background:{"transparent" if transparent or mask else "#fff"}"><img src="{p.as_uri()}" style="width:{w}px;height:{h}px;{rad}display:block"></body></html>'
    q=pathlib.Path(tempfile.mktemp(suffix=".html"));q.write_text(html)
    subprocess.run([CH,"--headless=new","--disable-gpu","--hide-scrollbars","--default-background-color="+("00000000" if transparent or mask else "FFFFFFFF"),f"--window-size={w},{h}",f"--screenshot={out}",q.as_uri()],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
out=pathlib.Path(".").resolve()
S_ICON=0.98*1024/ (2*RMAX) if False else None
# main icon: fit mark width ~ 62% of canvas
sc_icon=0.68*1024/(X1-X0)
d,b=mark(W,D)
icon=wrap(b,d,sc_icon,0,0,BG)
(out/"icon-flat.svg").write_text(icon)
shot(icon,out/"ios-icon-1024.png",1024)                       # opaque, unmasked (iOS applies the mask)
for s in (180,60,29): shot(icon,out/f"preview-{s}.png",s,mask=True)
# adaptive foreground: mark inside 66% safe circle (diameter 676)
sc_fg=338*0.97/RMAX
fg=wrap(b,d,sc_fg,0,0)
(out/"android-foreground.svg").write_text(fg)
shot(fg,out/"android-foreground-1024.png",1024,transparent=True)
bgsvg=f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9C8CFF"/><stop offset="1" stop-color="#8270F5"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#bg)"/></svg>'
shot(bgsvg,out/"android-background-1024.png",1024)
dm,bm=mark("#000","#000",opac=False,uid="k")
mono=wrap(bm,dm,sc_fg,0,0)
shot(mono,out/"android-monochrome-1024.png",1024,transparent=True)
# splash: solid #8E7CFF, mark ~ 40% of width
sc_sp=0.42*1284/(X1-X0)*(1024/1284)  # relative to 1024 viewBox scaled to 1284 wide below
spl=wrap(b,d,0.5*1024/(X1-X0),0,0)
spl_full=f'<svg xmlns="http://www.w3.org/2000/svg" width="1284" height="2778" viewBox="0 0 1284 2778"><defs>{d}</defs><rect width="1284" height="2778" fill="#8E7CFF"/><g transform="translate(130 877) scale(1)"><svg width="1024" height="1024" viewBox="0 0 1024 1024">{spl.split("</defs>",1)[1].rsplit("</svg>",1)[0]}</svg></g></svg>'
shot(spl_full,out/"splash-1284x2778.png",0,w=1284,h=2778)
shot(wrap(b,d,0.9*1024/(X1-X0),0,0),out/"splash-icon-1024.png",1024,transparent=True)  # mark only, transparent
shot(icon,out/"favicon-48.png",48,mask=True)
# contact
def row(bg): return f'<div style="background:{bg};padding:10px;display:flex;gap:14px;align-items:center">'+"".join(f'<img src="{(out/f"preview-{s}.png").as_uri()}" width="{s}">' for s in (180,60,29))+'</div>'
(out/"c.html").write_text('<body style="margin:0;display:flex">'+row("#e8e8ee")+row("#000"))
subprocess.run([CH,"--headless=new","--hide-scrollbars","--window-size=760,210",f"--screenshot={out/'contact.png'}",(out/"c.html").as_uri()],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
print(RMAX,X1-X0)
