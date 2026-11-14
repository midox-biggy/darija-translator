#!/usr/bin/env python3
"""
Python client for the Darija Translator REST service.

Uses only the Python standard library (urllib), so there is nothing to install.

    python3 darija_client.py "How are you?"               # one translation
    python3 darija_client.py --script latin "Good night"  # Darija in Latin letters
    python3 darija_client.py --speak "Welcome"            # also read it aloud
    python3 darija_client.py                              # interactive mode
    python3 darija_client.py --gui                        # small desktop window (Tkinter)

Server and credentials come from flags or the environment:
    DARIJA_URL (default http://localhost:8080), DARIJA_USER (student), DARIJA_PASSWORD (darija2026)
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass


class TranslatorError(Exception):
    """Raised when the server cannot be reached or returns an error."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


@dataclass
class Translation:
    translation: str
    source: str
    script: str
    provider: str
    model: str
    cached: bool
    duration_ms: int
    user: str | None


class DarijaClient:
    """Calls TranslatorResource.translate() over HTTP with Basic authentication."""

    def __init__(self, base_url: str, username: str, password: str, timeout: float = 90):
        self.base_url = base_url.rstrip("/")
        token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
        self._auth = f"Basic {token}"
        self.timeout = timeout

    def _request(self, method: str, path: str, body: dict | None = None, auth: bool = True) -> dict:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(self.base_url + path, data=data, method=method)
        req.add_header("Accept", "application/json")
        if data is not None:
            req.add_header("Content-Type", "application/json; charset=utf-8")
        if auth:
            req.add_header("Authorization", self._auth)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            try:
                message = json.loads(e.read().decode("utf-8")).get("message", e.reason)
            except (ValueError, AttributeError):
                message = e.reason
            if e.code == 401:
                message = f"{message} (check DARIJA_USER / DARIJA_PASSWORD)"
            raise TranslatorError(e.code, message) from None
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            reason = getattr(e, "reason", e)
            raise TranslatorError(0, f"Cannot reach {self.base_url}: {reason}") from None

    def health(self) -> dict:
        return self._request("GET", "/api/health", auth=False)

    def translate(self, text: str, source: str = "auto", script: str = "arabic") -> Translation:
        r = self._request("POST", "/api/translator/translate",
                          {"text": text, "source": source, "script": script})
        return Translation(r["translation"], r["source"], r["script"], r["provider"], r["model"],
                           r["cached"], r["durationMs"], r.get("user"))


# ---------------------------------------------------------------- text to speech

def speak(text: str, script: str) -> None:
    """Read the translation aloud: pyttsx3 if installed, otherwise the macOS 'say' command."""
    try:
        import pyttsx3  # optional: pip install pyttsx3
        engine = pyttsx3.init()
        for voice in engine.getProperty("voices"):
            langs = " ".join(str(lang) for lang in getattr(voice, "languages", [])) + voice.id
            if ("ar" if script == "arabic" else "fr") in langs.lower():
                engine.setProperty("voice", voice.id)
                break
        engine.say(text)
        engine.runAndWait()
        return
    except ImportError:
        pass
    if shutil.which("say"):
        voice = "Majed" if script == "arabic" else "Thomas"
        if subprocess.run(["say", "-v", voice, text], stderr=subprocess.DEVNULL).returncode != 0:
            subprocess.run(["say", text])
    else:
        print("(Read aloud needs 'pip install pyttsx3' on this system.)", file=sys.stderr)


# ---------------------------------------------------------------- user interfaces

def print_result(t: Translation) -> None:
    timing = "cached" if t.cached else f"{t.duration_ms / 1000:.1f} s"
    print(t.translation)
    print(f"  [{t.provider}/{t.model} · {timing}]", file=sys.stderr)


def interactive(client: DarijaClient, source: str, script: str, read_aloud: bool) -> None:
    print("Darija Translator — type text and press Enter.")
    print("Commands: :latin  :arabic  :speak  :quit\n")
    while True:
        try:
            line = input(f"[{script}] > ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if not line:
            continue
        if line in (":q", ":quit", ":exit"):
            return
        if line in (":latin", ":arabic"):
            script = line[1:]
            continue
        if line == ":speak":
            read_aloud = not read_aloud
            print(f"Read aloud {'on' if read_aloud else 'off'}")
            continue
        try:
            t = client.translate(line, source, script)
            print_result(t)
            if read_aloud:
                speak(t.translation, t.script)
        except TranslatorError as e:
            print(f"Error ({e.status}): {e}", file=sys.stderr)


def gui(client: DarijaClient, source: str, script: str) -> None:
    try:
        import tkinter as tk
        from tkinter import ttk
    except ImportError:
        sys.exit("Tkinter is not installed (on macOS/Homebrew: brew install python-tk).")
    import threading

    root = tk.Tk()
    root.title("Darija Translator")
    root.geometry("560x460")
    frame = ttk.Frame(root, padding=12)
    frame.pack(fill="both", expand=True)

    ttk.Label(frame, text="Text").pack(anchor="w")
    src = tk.Text(frame, height=7, wrap="word", font=("Helvetica", 14))
    src.pack(fill="x")

    bar = ttk.Frame(frame)
    bar.pack(fill="x", pady=8)
    script_var = tk.StringVar(value=script)
    ttk.Radiobutton(bar, text="Arabic script", value="arabic", variable=script_var).pack(side="left")
    ttk.Radiobutton(bar, text="Latin script", value="latin", variable=script_var).pack(side="left", padx=8)
    status = ttk.Label(frame, text="")
    out = tk.Text(frame, height=7, wrap="word", font=("Geeza Pro", 18))

    def do_translate(*_):
        text = src.get("1.0", "end").strip()
        if not text:
            return
        status.config(text="Translating…")

        def work():
            try:
                t = client.translate(text, source, script_var.get())
                root.after(0, lambda: show(t))
            except TranslatorError as e:
                root.after(0, lambda: status.config(text=f"Error ({e.status}): {e}"))

        threading.Thread(target=work, daemon=True).start()

    def show(t: Translation):
        out.delete("1.0", "end")
        out.insert("1.0", t.translation)
        out.tag_configure("rtl", justify="right" if t.script == "arabic" else "left")
        out.tag_add("rtl", "1.0", "end")
        status.config(text=f"{t.provider}/{t.model} · {'cached' if t.cached else f'{t.duration_ms/1000:.1f} s'}")

    def do_speak():
        text = out.get("1.0", "end").strip()
        if text:
            threading.Thread(target=speak, args=(text, script_var.get()), daemon=True).start()

    def do_copy():
        root.clipboard_clear()
        root.clipboard_append(out.get("1.0", "end").strip())
        status.config(text="Copied.")

    ttk.Button(bar, text="Translate", command=do_translate).pack(side="right")
    ttk.Button(bar, text="Read aloud", command=do_speak).pack(side="right", padx=4)
    ttk.Button(bar, text="Copy", command=do_copy).pack(side="right")
    ttk.Label(frame, text="Darija").pack(anchor="w")
    out.pack(fill="both", expand=True)
    status.pack(anchor="w", pady=(6, 0))
    root.bind("<Control-Return>", do_translate)
    root.bind("<Command-Return>", do_translate)
    root.mainloop()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Translate text into Moroccan Darija with the Darija Translator API.")
    p.add_argument("text", nargs="*", help="text to translate (omit for interactive mode; '-' reads stdin)")
    p.add_argument("--url", default=os.getenv("DARIJA_URL", "http://localhost:8080"))
    p.add_argument("--user", default=os.getenv("DARIJA_USER", "student"))
    p.add_argument("--password", default=os.getenv("DARIJA_PASSWORD", "darija2026"))
    p.add_argument("--source", default="auto", help="source language, e.g. English, French (default: auto)")
    p.add_argument("--script", choices=["arabic", "latin"], default="arabic")
    p.add_argument("--speak", action="store_true", help="read the translation aloud")
    p.add_argument("--gui", action="store_true", help="open a desktop window")
    p.add_argument("--json", action="store_true", help="print the raw JSON answer")
    args = p.parse_args(argv)

    client = DarijaClient(args.url, args.user, args.password)
    if args.gui:
        gui(client, args.source, args.script)
        return 0
    if not args.text:
        interactive(client, args.source, args.script, args.speak)
        return 0

    text = sys.stdin.read() if args.text == ["-"] else " ".join(args.text)
    try:
        t = client.translate(text, args.source, args.script)
    except TranslatorError as e:
        print(f"Error ({e.status}): {e}", file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(t.__dict__, ensure_ascii=False, indent=2))
    else:
        print_result(t)
    if args.speak:
        speak(t.translation, t.script)
    return 0


if __name__ == "__main__":
    sys.exit(main())
