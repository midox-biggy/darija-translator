#!/usr/bin/env python3
"""
Turns a recording made with `DEMO_RECORD=<dir> node director.mjs` into the final demo video:
burned-in subtitles, a chapter title at the start of each scene, fades, and (optionally)
a narration track made by tts.py.

    python3 make_video.py <dir> [--voice] [--out demo.mp4]

Needs ffmpeg and Pillow. Homebrew's ffmpeg has no subtitle/drawtext filter, so captions are drawn
as transparent PNGs with Pillow and laid over the video with ffmpeg's overlay filter.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1200                     # output size (16:10, the Chrome window's ratio)
FONT = "/System/Library/Fonts/SFNS.ttf"
RED = (193, 39, 45, 255)


def font(size: int, weight: str = "Regular") -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(FONT, size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f


def chunks(text: str, max_words: int = 13) -> list[str]:
    """Splits narration into subtitle-sized pieces: sentences, then clauses, then word groups."""
    out: list[str] = []
    for sentence in re.split(r"(?<=[.!?])\s+", text.strip()):
        words = sentence.split()
        if len(words) <= max_words:
            out.append(sentence)
            continue
        parts = re.split(r"(?<=[,:;])\s+", sentence)
        buf = ""
        for p in parts:
            if buf and len((buf + " " + p).split()) > max_words:
                out.append(buf)
                buf = p
            else:
                buf = (buf + " " + p).strip()
        if buf:
            out.append(buf)
    final: list[str] = []
    for c in out:                                    # last resort: hard split very long clauses
        w = c.split()
        while len(w) > max_words + 4:
            final.append(" ".join(w[:max_words]))
            w = w[max_words:]
        final.append(" ".join(w))
    return final


def wrap(draw: ImageDraw.ImageDraw, text: str, f, max_w: int) -> list[str]:
    lines, cur = [], ""
    for word in text.split():
        trial = (cur + " " + word).strip()
        if draw.textlength(trial, font=f) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    lines.append(cur)
    return lines


def render(path: Path, caption: str | None, chapter: str | None) -> None:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if chapter:
        f = font(30, "Semibold")
        tw = d.textlength(chapter, font=f)
        x, y = 36, 118
        d.rounded_rectangle([x, y, x + tw + 44, y + 58], radius=29, fill=RED)
        d.text((x + 22, y + 11), chapter, font=f, fill="white")
    if caption:
        f = font(40, "Medium")
        lines = wrap(d, caption, f, 1480)
        lh = 54
        box_h = lh * len(lines) + 36
        box_w = max(d.textlength(l, font=f) for l in lines) + 64
        x0, y0 = (W - box_w) / 2, H - box_h - 48
        d.rounded_rectangle([x0, y0, x0 + box_w, y0 + box_h], radius=18, fill=(12, 12, 14, 205))
        for i, line in enumerate(lines):
            lw = d.textlength(line, font=f)
            d.text(((W - lw) / 2, y0 + 16 + i * lh), line, font=f, fill=(255, 255, 255, 255))
    img.save(path)


def audio_seconds(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True).stdout.strip()
    return float(out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--voice", action="store_true", help="mix voice/NN.wav narration files made by tts.py")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    root = Path(args.dir)
    tl = json.loads((root / "timeline.json").read_text())
    scenes = [s for s in tl["scenes"] if s["index"] != "end"]
    total = tl["scenes"][-1]["end"]
    out = Path(args.out) if args.out else root / "demo.mp4"
    voice = {s["index"]: root / "voice" / f"{s['index']:02d}.wav" for s in scenes} if args.voice else {}
    VOICE_DELAY = 0.35

    # 1. caption events
    events = []                                      # (start, end, caption, chapter)
    for s in scenes:
        pieces = chunks(s["say"])
        if args.voice and voice[s["index"]].exists():
            span_start, span = s["start"] + VOICE_DELAY, audio_seconds(voice[s["index"]])
        else:
            span_start, span = s["start"] + 0.2, max(2.0, s["end"] - s["start"] - 0.5)
        weights = [len(p) + 12 for p in pieces]
        t = span_start
        for p, wgt in zip(pieces, weights):
            dur = span * wgt / sum(weights)
            events.append((t, t + dur, p))
            t += dur
    chapters = [(s["start"], s["start"] + 3.5, f"{s['index']:02d} · {s['title']}") for s in scenes]

    # 2. one PNG per interval between change points
    cuts = sorted({0.0, total, *[e[0] for e in events], *[e[1] for e in events], *[c[0] for c in chapters], *[c[1] for c in chapters]})
    frames = root / "captions"
    frames.mkdir(exist_ok=True)
    listing, cache = [], {}
    for a, b in zip(cuts, cuts[1:]):
        if b - a < 0.02:
            continue
        mid = (a + b) / 2
        cap = next((e[2] for e in events if e[0] <= mid < e[1]), None)
        chap = next((c[2] for c in chapters if c[0] <= mid < c[1]), None)
        key = (cap, chap)
        if key not in cache:
            p = frames / f"c{len(cache):04d}.png"
            render(p, cap, chap)
            cache[key] = p
        listing.append((cache[key], b - a))
    with open(root / "captions.txt", "w") as f:
        for p, dur in listing:
            f.write(f"file '{p.resolve()}'\nduration {dur:.3f}\n")
        f.write(f"file '{listing[-1][0].resolve()}'\n")

    # 3. ffmpeg: scale the recording, overlay captions, fades, audio
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(root / "raw.mp4"),
           "-f", "concat", "-safe", "0", "-i", str(root / "captions.txt")]
    filters = [f"[0:v]scale={W}:{H}:flags=lanczos,format=yuv420p[base]",
               "[1:v]format=rgba[cap]",
               f"[base][cap]overlay=0:0:shortest=0:eof_action=pass,fade=t=in:st=0:d=0.8,fade=t=out:st={total - 1.2:.2f}:d=1.2[v]"]
    audio_inputs = []
    if args.voice:
        for s in scenes:
            v = voice[s["index"]]
            if v.exists():
                cmd += ["-i", str(v)]
                n = len(audio_inputs) + 2
                ms = int((s["start"] + VOICE_DELAY) * 1000)
                filters.append(f"[{n}:a]aresample=48000,adelay={ms}|{ms},apad[a{n}]")
                audio_inputs.append(f"[a{n}]")
    if audio_inputs:
        filters.append(f"{''.join(audio_inputs)}amix=inputs={len(audio_inputs)}:normalize=0:duration=longest,"
                       f"atrim=0:{total:.2f},afade=t=out:st={total - 1.2:.2f}:d=1.2[aout]")
    else:
        cmd += ["-f", "lavfi", "-t", f"{total:.2f}", "-i", "anullsrc=r=48000:cl=stereo"]
        filters.append(f"[{2}:a]anull[aout]")
    cmd += ["-filter_complex", ";".join(filters), "-map", "[v]", "-map", "[aout]", "-t", f"{total:.2f}",
            "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(out)]
    subprocess.run(cmd, check=True)
    print(f"wrote {out} ({total:.1f} s, {len(events)} captions)")


if __name__ == "__main__":
    main()
