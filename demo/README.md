# Automated demo (for recording the video)

This folder plays the 5-minute project demo one step at a time, so the only live part is the voice-over.

- **Left of the screen (record this):** a real Google Chrome window, 1280×800, with the extension loaded. It shows the title card, UML diagrams, a code viewer that highlights each key block, a terminal running real commands, an article page for the extension, the PHP page, and the mobile app in a phone frame. A visible cursor shows every click.
- **Right of the screen (not recorded):** a teleprompter with the text to read, a note of what is happening, and a **Next** button. → and Space also work.

## Requirements

- macOS with Google Chrome, JDK 17+, Node 18+, Docker Desktop (for the PHP page), and Xcode command-line tools (`swiftc`).
- `server/config.properties` with a working LLM (for example `GEMINI_API_KEY` and `GEMINI_MODEL`).
- **For the real right-click menu:** System Settings → Privacy & Security → Accessibility → allow the app that starts the demo (Terminal, or Claude). Without it, that step opens the side panel directly and the narration says so.

## Run

```bash
cd demo
npm install
npm start
```

1. Wait until every check in the teleprompter shows ✓. These are: the server jar, the LLM, the PHP container, the Expo web build, Chrome, and the right-click permission.
2. In QuickTime Player: **File → New Screen Recording → Record Selected Portion**. Drag over the Chrome window on the left, pick your microphone in **Options**, then click **Record**.
3. Click **Start ▶** in the teleprompter. Read the white text; after each scene finishes (status *ready*), click **Next**.
4. In the voice-to-voice scene, say the yellow sentence out loud. If the microphone hears nothing, the sentence is typed automatically.
5. Stop the recording after the last scene, and press Ctrl+C in the terminal to close everything.

`DEMO_AUTOPLAY=1 npm start` plays every scene without clicks (a dry run). Add `DEMO_SHOTS=<folder>` to save a screenshot after each scene.

## Files

| File | Role |
|---|---|
| `director.mjs` | Starts everything, lays out the windows, drives Chrome and the side panel over the DevTools protocol, runs commands. |
| `scenes.mjs` | The 19 scenes: narration + actions. Edit the text here. |
| `stage/` | The pages shown on the recorded side (code viewer, terminal, diagrams, article, phone frame, teleprompter). |
| `tools/osinput.swift` | Small macOS helper that moves the real mouse and clicks Chrome's right-click menu. |
| `llm-check.mjs` | Warms up the model before recording. |
