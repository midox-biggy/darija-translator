#!/usr/bin/env python3
"""
Builds raw.mp4 from the frames Chrome streamed during `DEMO_RECORD=<dir> node director.mjs`
(frame-capture mode, used when macOS screen recording is not allowed).

Each output frame = a drawn browser frame (tab + address bar with the real URL) + the latest page frame
+ the side panel (when open) + Chrome's right-click menu at the moment it was open.

    python3 compose.py <dir>          → <dir>/raw.mp4 (1920x1200, 30 fps)
"""
from __future__ import annotations

import bisect
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1920, 1200, 30
BAR = 120                     # browser chrome height (tab strip + toolbar)
SCALE = 1.5                   # CSS pixel → output pixel
FONT = "/System/Library/Fonts/SFNS.ttf"
DEMO = Path(__file__).resolve().parent


def font(size, weight="Regular"):
    f = ImageFont.truetype(FONT, size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f


ICON = Image.open(DEMO.parent / "chrome-extension/icons/icon32.png").convert("RGBA").resize((26, 26), Image.LANCZOS)
ICON_SMALL = ICON.resize((20, 20), Image.LANCZOS)


def short_url(url: str) -> str:
    for p in ("http://", "https://"):
        if url.startswith(p):
            return url[len(p):]
    return url


def browser_bar(url: str, title: str) -> Image.Image:
    img = Image.new("RGB", (W, BAR), "#dee1e6")
    d = ImageDraw.Draw(img)
    for i, c in enumerate(("#ff5f57", "#febc2e", "#28c840")):          # window buttons
        d.ellipse([22 + i * 24 - 7, 26 - 7, 22 + i * 24 + 7, 26 + 7], fill=c)
    d.rounded_rectangle([96, 8, 470, 60], radius=12, fill="white")      # active tab
    is_ext = url.startswith("chrome-extension://")
    if is_ext:
        img.paste(ICON_SMALL, (112, 22), ICON_SMALL)
    else:
        d.ellipse([112, 22, 132, 42], outline="#5f6368", width=2)
        d.line([112, 32, 132, 32], fill="#5f6368", width=2)
    t = title or short_url(url)
    f = font(19)
    while d.textlength(t, font=f) > 300 and len(t) > 4:
        t = t[:-2]
    if t != (title or short_url(url)):
        t = t.rstrip() + "…"
    d.text((142, 20), t, font=f, fill="#202124")
    d.text((440, 18), "×", font=font(22), fill="#5f6368")
    d.text((490, 16), "+", font=font(26), fill="#5f6368")
    d.rectangle([0, 60, W, BAR], fill="white")                          # toolbar
    for x, ch in ((26, "‹"), (64, "›")):
        d.text((x, 66), ch, font=font(40, "Light"), fill="#5f6368")
    d.arc([98, 76, 120, 98], 30, 330, fill="#5f6368", width=3)          # reload
    d.rounded_rectangle([146, 68, W - 150, 112], radius=22, fill="#f1f3f4")
    lock = "ⓘ" if url.startswith("http://") else "⊙"
    d.text((168, 77), lock, font=font(22), fill="#5f6368")
    d.text((202, 78), "Darija Translator  |  " + short_url(url) if is_ext else short_url(url), font=font(21), fill="#202124")
    img.paste(ICON, (W - 128, 77), ICON)                                # pinned extension
    d.text((W - 88, 72), "⧉", font=font(26), fill="#5f6368")
    d.ellipse([W - 50, 76, W - 22, 104], fill="#c1272d")
    d.text((W - 42, 78), "E", font=font(19, "Semibold"), fill="white")
    d.line([0, BAR - 1, W, BAR - 1], fill="#dadce0", width=1)
    return img


def panel_header(width: int, height: int) -> Image.Image:
    img = Image.new("RGB", (width, height), "#ffffff")
    d = ImageDraw.Draw(img)
    img.paste(ICON_SMALL, (14, (height - 20) // 2), ICON_SMALL)
    d.text((44, (height - 22) // 2), "Darija Translator", font=font(19, "Medium"), fill="#202124")
    d.text((width - 34, (height - 26) // 2), "×", font=font(26), fill="#5f6368")
    d.line([0, height - 1, width, height - 1], fill="#dadce0")
    return img


def context_menu(text: str, highlighted: bool) -> Image.Image:
    """Chrome's macOS context menu for a text selection, as it looked during the recording."""
    snippet = text if len(text) <= 24 else text[:22].rstrip() + "…"
    items = ["Look Up “%s”" % snippet, None, "Copy", "Copy Link to Highlight", f"Search Google for “{snippet}”", "Print…",
             None, f"Translate “{snippet}” to Darija", None, "Inspect"]
    f = font(20)
    w = int(max(ImageDraw.Draw(Image.new("RGB", (1, 1))).textlength(i or "", font=f) for i in items)) + 90
    row, sep = 34, 13
    h = sum(row if i else sep for i in items) + 14
    img = Image.new("RGBA", (w + 24, h + 24), (0, 0, 0, 0))
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([12, 16, w + 12, h + 16], radius=12, fill=(0, 0, 0, 70))
    from PIL import ImageFilter
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(9)))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([12, 10, w + 12, h + 10], radius=12, fill=(246, 246, 246, 250), outline=(200, 200, 200, 255))
    y = 17
    for it in items:
        if it is None:
            d.line([24, y + 6, w, y + 6], fill=(214, 214, 214, 255))
            y += sep
            continue
        ours = it.startswith("Translate “")
        if ours and highlighted:
            d.rounded_rectangle([18, y, w + 6, y + row - 2], radius=6, fill=(10, 100, 225, 255))
        color = "white" if ours and highlighted else "#1d1d1f"
        x = 30
        if ours:
            img.paste(ICON_SMALL, (x, y + 6), ICON_SMALL)
            x += 30
        d.text((x, y + 5), it, font=f, fill=color)
        y += row
    return img


def main():
    root = Path(sys.argv[1])
    cap = json.loads((root / "frames.json").read_text())
    tl = json.loads((root / "timeline.json").read_text())
    t0 = cap["t0"]
    total = tl["scenes"][-1]["end"]
    frames = cap["frames"]
    page = sorted((f for f in frames if f["src"] == "page"), key=lambda f: f["t"])
    panel = sorted((f for f in frames if f["src"] == "panel"), key=lambda f: f["t"])
    pt, nt = [f["t"] for f in page], [f["t"] for f in panel]
    ev = sorted(cap["events"], key=lambda e: e["t"])

    def last_event(kind, t):
        hit = None
        for e in ev:
            if e["t"] > t:
                break
            if e["type"] == kind:
                hit = e
        return hit

    bars, menus = {}, {}
    ff = subprocess.Popen(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "h264_videotoolbox", "-b:v", "20M",
                           "-pix_fmt", "yuv420p", str(root / "raw.mp4")], stdin=subprocess.PIPE)
    prev_key, prev_bytes = None, None
    cache_img = {}

    def load(f):
        if f["file"] not in cache_img:
            if len(cache_img) > 6:
                cache_img.clear()
            cache_img[f["file"]] = Image.open(root / "frames" / f["file"]).convert("RGB")
        return cache_img[f["file"]]

    n = int(total * FPS)
    for k in range(n):
        t = t0 + k / FPS
        pi = bisect.bisect_right(pt, t) - 1
        pf = page[pi] if pi >= 0 else None
        pe = last_event("panel", t)
        open_ = bool(pe and pe.get("open"))
        ni = bisect.bisect_right(nt, t) - 1
        nf = panel[ni] if open_ and ni >= 0 and panel[ni]["t"] >= pe["t"] - 0.5 else None
        ue = last_event("url", t) or {"url": "", "title": ""}
        me = last_event("menu", t)
        menu = None
        if me and me.get("open"):
            close = next((e for e in ev if e["type"] == "menu" and e["t"] > me["t"] and not e.get("open")), None)
            hl = close is not None and t > close["t"] - 0.7
            menu = (me["x"], me["y"], me["text"], hl)
        key = (pf and pf["file"], nf and nf["file"], ue["url"], ue.get("title"), menu)
        if key != prev_key:
            canvas = Image.new("RGB", (W, H), "white")
            bk = (ue["url"], ue.get("title"))
            if bk not in bars:
                bars[bk] = browser_bar(*bk)
            canvas.paste(bars[bk], (0, 0))
            x = 0
            if pf:
                pw, ph = round(pf["cssW"] * SCALE), round(pf["cssH"] * SCALE)
                page_img = load(pf).resize((pw, ph), Image.BILINEAR)
                if nf:
                    # the page may not have repainted at its new, narrower width yet: crop it to make room
                    pw = min(pw, W - round(nf["cssW"] * SCALE))
                    page_img = page_img.crop((0, 0, pw, ph))
                canvas.paste(page_img, (0, BAR))
                x = pw
                if nf:
                    nw, nh = round(nf["cssW"] * SCALE), round(nf["cssH"] * SCALE)
                    nw = min(nw, W - x)
                    head = max(0, ph - nh)
                    if head:
                        canvas.paste(panel_header(nw, head), (x, BAR))
                    canvas.paste(load(nf).resize((round(nf["cssW"] * SCALE), nh), Image.BILINEAR).crop((0, 0, nw, nh)), (x, BAR + head))
                    ImageDraw.Draw(canvas).line([x, BAR, x, H], fill="#dadce0", width=2)
            if menu:
                mk = (menu[2], menu[3])
                if mk not in menus:
                    menus[mk] = context_menu(menu[2], menu[3])
                m = menus[mk]
                mx, my = int(menu[0] * SCALE) - 10, int(BAR + menu[1] * SCALE) - 8
                mx = min(mx, W - m.width)
                canvas.paste(m, (mx, my), m)
            prev_bytes, prev_key = canvas.tobytes(), key
        ff.stdin.write(prev_bytes)
        if k % (FPS * 30) == 0:
            print(f"  {k / FPS:5.0f} s / {total:.0f} s", flush=True)
    ff.stdin.close()
    ff.wait()
    print("wrote", root / "raw.mp4")


if __name__ == "__main__":
    main()
