# Demo video script (about 5 minutes)

> The automated version of this script is in [`demo/`](../demo): it plays each step on screen and shows the narration in a teleprompter. The full narration lives in [`demo/scenes.mjs`](../demo/scenes.mjs). The table below is the short outline.

Record the screen with QuickTime (File → New Screen Recording) or OBS. Have these ready before you start:
the server running with your Gemini key, the extension loaded, the PHP page on `localhost:8000`,
the mobile app open in Expo Go or the web preview, and a terminal.

| Time | Show | Say (short) |
|---|---|---|
| 0:00–0:20 | README on GitHub | "LLM-powered REST service that translates into Moroccan Darija, with five clients." |
| 0:20–1:30 | **Code walkthrough** in the IDE: `TranslatorResource.translate()`, `TranslationService.systemPrompt()`, `GeminiClient.complete()` | REST endpoint → service → prompt (Darija, not Fusha; text between `<<< >>>` so it is translated, not obeyed) → Gemini. |
| 1:30–2:10 | `BasicAuthServerAuthModule.validateRequest()` and `DarijaServer` (security constraint + `registerServerAuthModule`) | Jakarta Authentication: Tomcat calls the module before every request; callbacks hand the caller and role to the container. |
| 2:10–2:40 | Terminal: `./mvnw package` (tests pass), `java -jar target/darija-translator.jar` | Embedded Tomcat, one jar. |
| 2:40–3:10 | cURL / Postman: 401 without auth, 401 wrong password, 200 with `student:darija2026`, `script=latin` | Security works; Arabic and Latin output. |
| 3:10–4:10 | **Chrome:** select a paragraph on a news site → right-click → *Translate to Darija* → side panel. Then select another sentence (live paste). Click 🔊 Read aloud. Click 🔁 Voice to voice and say "Where is the nearest pharmacy?" | Side panel, context menu, auto-paste, TTS, voice-to-voice. |
| 4:10–4:40 | PHP page and `python3 darija_client.py --speak "Good night"` | Same API from PHP and Python. |
| 4:40–5:00 | Mobile app: Paste & translate, Read aloud, Share. Close with the deployment diagram. | Mobile client; architecture recap. |

Tip: show one request with `LLM_PROVIDER=ollama` if you have a small local model, to cover the "lightweight LLM" extension.
