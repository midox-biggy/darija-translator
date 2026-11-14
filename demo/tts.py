#!/usr/bin/env python3
"""
Optional narrator voice: turns narration.json (from `DEMO_NARRATION=... node director.mjs`) into
voice/NN.wav files with Gemini text-to-speech, plus durations.json so each scene lasts as long as
its narration.   python3 tts.py <dir> [--voice Charon]
"""
import argparse, base64, json, subprocess, sys, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL = "gemini-3.8-flash-tts"
STYLE = ("Read this as a confident male university student presenting his own project in a demo video. "
         "Natural, relaxed, conversational pace, clear English pronunciation, not like an announcer:\n\n")


def key() -> str:
    for line in (ROOT / "server/config.properties").read_text().splitlines():
        if line.startswith("GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("GEMINI_API_KEY missing in server/config.properties")


def speak(text: str, voice: str) -> bytes:
    body = {"contents": [{"parts": [{"text": STYLE + text}]}],
            "generationConfig": {"responseModalities": ["AUDIO"],
                                 "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}}
    req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
                                 data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": key()})
    for attempt in range(5):
        try:
            d = json.load(urllib.request.urlopen(req, timeout=180))
            return base64.b64decode(d["candidates"][0]["content"]["parts"][0]["inlineData"]["data"])
        except Exception as e:  # rate limits: wait and retry
            print("  retry:", e, file=sys.stderr)
            time.sleep(15 * (attempt + 1))
    raise SystemExit("text-to-speech failed")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--voice", default="Charon")
    a = ap.parse_args()
    root = Path(a.dir)
    (root / "voice").mkdir(parents=True, exist_ok=True)
    durations = {}
    for scene in json.loads((root / "narration.json").read_text()):
        wav = root / "voice" / f"{scene['index']:02d}.wav"
        if not wav.exists():
            print("scene", scene["index"], scene["title"])
            raw = root / "voice" / f"{scene['index']:02d}.raw"
            raw.write_bytes(speak(scene["say"], a.voice))
            # the API returns WAV or raw 24 kHz 16-bit PCM; normalise both to WAV
            fmt = [] if raw.read_bytes()[:4] == b"RIFF" else ["-f", "s16le", "-ar", "24000", "-ac", "1"]
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *fmt, "-i", str(raw), str(wav)], check=True)
            raw.unlink()
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(wav)],
                             capture_output=True, text=True).stdout
        durations[scene["index"]] = round(float(out) + 0.6, 2)
    (root / "durations.json").write_text(json.dumps(durations, indent=2))
    print("total narration:", round(sum(durations.values()) / 60, 2), "min")


if __name__ == "__main__":
    main()
