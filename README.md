# Darija Translator: an LLM-powered RESTful web service

Mini Project 2. A Java REST service that translates text from any language into **Moroccan Arabic (Darija)** using a large language model (Google Gemini by default, or a small local model through Ollama / LM Studio). Five clients use it: a **Chrome extension** in the browser side panel, a **PHP** web app, a **Python** app, and a **React Native** mobile app. The fifth client is plain **cURL** or Postman.

```
┌─────────────────┐   HTTP + JSON + Basic auth   ┌──────────────────────────────────────┐   HTTPS   ┌────────────┐
│ Chrome extension│ ───────────────────────────▶ │  Embedded Tomcat 11                  │ ────────▶ │ Gemini API │
│ PHP · Python    │                              │  Jakarta Authentication (Basic SAM)  │           └────────────┘
│ React Native    │ ◀─────────────────────────── │  Jakarta REST: TranslatorResource    │  or local Ollama / LM Studio
└─────────────────┘        {"translation": …}    └──────────────────────────────────────┘
```

## What is in this repository

| Folder | What it is |
|---|---|
| [`server/`](server) | **Maven project.** Jakarta REST (Jersey 4) on an embedded Tomcat 11, secured with Jakarta Authentication. |
| [`chrome-extension/`](chrome-extension) | Manifest V3 extension: side panel, right-click menu, keyboard shortcut, live selection, voice input, read aloud. |
| [`clients/php/`](clients/php) | PHP web page + command-line client (cURL, with a fallback when cURL is missing). |
| [`clients/python/`](clients/python) | Python client with a CLI, an interactive mode, and a Tkinter window. Standard library only. |
| [`clients/mobile/`](clients/mobile) | React Native app built with Expo (Android, iOS, web). |
| [`docs/uml/`](docs/uml) | Class, deployment, sequence and use-case diagrams (PlantUML sources + PNG/SVG). |
| [`docs/`](docs) | Demo-video script and the technical blog post draft. |

## Requirements checklist

| Requirement | Where |
|---|---|
| REST endpoint **`TranslatorResource`** with business method **`translate()`** | [`TranslatorResource.java`](server/src/main/java/ma/aui/darija/api/TranslatorResource.java) |
| Jakarta RESTful Web Services API | `@Path`, `@POST`, `@Consumes`, `ExceptionMapper`, `ContainerResponseFilter`, Jersey `ResourceConfig` |
| Translation done by an LLM (Gemini or another free model) | [`GeminiClient`](server/src/main/java/ma/aui/darija/llm/GeminiClient.java), [`OpenAiCompatibleClient`](server/src/main/java/ma/aui/darija/llm/OpenAiCompatibleClient.java) (Ollama / LM Studio) |
| Tested with an HTTP tool | cURL commands below, a Postman collection in [`server/postman_collection.json`](server/postman_collection.json), and 18 automated JUnit tests |
| Secured with **Jakarta Authentication**, Basic auth | [`BasicAuthServerAuthModule`](server/src/main/java/ma/aui/darija/security/BasicAuthServerAuthModule.java) implements `jakarta.security.auth.message.module.ServerAuthModule`, registered with `AuthConfigFactory.registerServerAuthModule(...)` |
| Chrome extension, Manifest V3, `chrome.sidePanel` | [`manifest.json`](chrome-extension/manifest.json), [`background.js`](chrome-extension/background.js), [`sidepanel.js`](chrome-extension/sidepanel.js) |
| Selected text copied and pasted automatically | Right-click menu, keyboard shortcut, and live page selection all paste into the panel ([`content.js`](chrome-extension/content.js)) |
| Reachable from the right-click (context) menu | *Translate "…" to Darija* |
| PHP client, Python app, React Native mobile app | [`clients/`](clients) |
| *Extension:* speech translation (voice to voice) and read aloud | Side panel 🎤 **Speak** and 🔁 **Voice to voice** buttons; 🔊 **Read aloud** in the extension, the PHP page, the Python app and the mobile app |
| *Extension:* lightweight LLM for local deployment | `LLM_PROVIDER=ollama` (e.g. `qwen2.5:3b`) or `LLM_PROVIDER=lmstudio` |
| *Extension:* embedded container | Embedded Apache Tomcat. `java -jar darija-translator.jar` is all it takes. |
| UML: class + deployment (+ sequence, use case) | [`docs/uml/`](docs/uml) |

## 1. Run the server

You need **JDK 17 or newer**. You do not need to install Maven: the wrapper (`mvnw`) downloads it.

1. Get a free Gemini API key at <https://aistudio.google.com/apikey>.
2. Build and start:

```bash
cd server
./mvnw package                    # compiles, runs the 18 tests, builds target/darija-translator.jar
GEMINI_API_KEY=your-key java -jar target/darija-translator.jar
```

On Windows, use `mvnw.cmd package` and `set GEMINI_API_KEY=your-key` first.

The server listens on <http://localhost:8080>. Opening that address in a browser shows a short help page.

**Demo account:** `student` / `darija2026`.

### Configuration

Each setting can be an environment variable, a `-D` system property, or a line in a `config.properties` file in the folder you start the server from. The repository ignores that file, so your key stays out of git.

| Variable | Default | Meaning |
|---|---|---|
| `GEMINI_API_KEY` | (none) | Your Gemini key |
| `GEMINI_MODEL` | `gemini-flash-latest` | Any Gemini model id |
| `LLM_PROVIDER` | `gemini` | `gemini`, `ollama`, `lmstudio` or `openai` (any OpenAI-compatible API) |
| `OPENAI_BASE_URL` | `http://localhost:11434/v1` (Ollama) or `:1234/v1` (LM Studio) | Base URL of the local model server |
| `OPENAI_MODEL` | `qwen2.5:3b` | Local model name |
| `PORT` | `8080` | HTTP port |
| `USERS_FILE` | bundled `users.properties` | Your own user list |
| `LLM_TIMEOUT_SECONDS` | `60` | How long to wait for the model |

**Run fully offline with a small local model (Ollama):**

```bash
ollama pull qwen2.5:3b
LLM_PROVIDER=ollama OPENAI_MODEL=qwen2.5:3b java -jar target/darija-translator.jar
```

**Add a user:** print a PBKDF2 hash, then add `name = <hash>` to a users file and point `USERS_FILE` at it.

```bash
java -jar target/darija-translator.jar hash MyPassword123
```

## 2. The API

| Method and path | Auth | Description |
|---|---|---|
| `POST /api/translator/translate` | Basic | **`TranslatorResource.translate()`**. Body: `{"text": "...", "source": "auto", "script": "arabic"}` |
| `GET /api/translator/translate?text=...&script=latin` | Basic | Same, with query parameters |
| `GET /api/translator/me` | Basic | Checks your credentials without spending LLM quota |
| `GET /api/health` | public | Status, provider and model |

- `source`: the source language name (`English`, `French`…) or `auto` (default).
- `script`: `arabic` (default) gives Darija in Arabic letters; `latin` gives Arabizi (`kidayr? 3la slamtk`).

### Try it with cURL

```bash
# OK
curl -u student:darija2026 -H "Content-Type: application/json" \
     -d '{"text":"How are you? I hope everything is fine.","source":"English"}' \
     http://localhost:8080/api/translator/translate

# Latin script, GET form
curl -u student:darija2026 "http://localhost:8080/api/translator/translate?script=latin&text=Good%20morning"

# 401: no credentials
curl -i -X POST -H "Content-Type: application/json" -d '{"text":"hi"}' http://localhost:8080/api/translator/translate
```

Example answer:

```json
{
  "translation": "كيداير؟ إن شاء الله كولشي مزيان.",
  "source": "English",
  "target": "Moroccan Arabic (Darija)",
  "script": "arabic",
  "provider": "gemini",
  "model": "gemini-flash-latest",
  "cached": false,
  "durationMs": 1240,
  "user": "student"
}
```

### Errors

Every error is JSON: `{"status": 401, "error": "Unauthorized", "message": "..."}`.

| Status | When |
|---|---|
| 400 | Empty text, more than 5000 characters, bad `script`, malformed JSON |
| 401 | Missing or wrong credentials (sent by the Jakarta Authentication module) |
| 429 | The LLM provider's free quota is used up |
| 502 | The LLM provider failed or could not be reached |
| 503 | No API key configured |

To test in **Postman**, import [`server/postman_collection.json`](server/postman_collection.json). It already has Basic auth set on the protected requests.

## 3. Chrome extension

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the `chrome-extension` folder.
2. With the server running, select text on any page, **right-click → Translate "…" to Darija**. The side panel opens with the text already pasted and translated.

Other features:

- **Toolbar icon** opens the side panel. **⌘⇧Y / Ctrl+Shift+Y** translates the current selection.
- **Live selection:** while the panel is open, any text you select on the page is pasted (and, if you want, translated) automatically.
- **Arabic or Latin script** toggle.
- 🔊 **Read aloud** (Web Speech API). It uses a Moroccan or other Arabic voice when your system has one.
- 🎤 **Speak** and 🔁 **Voice to voice:** say a sentence, the panel translates it and reads the Darija back. The first time, Chrome asks for the microphone in a tab, because side panels cannot show that prompt.
- **Copy**, auto-copy, and the 20 most recent translations.
- **Settings** (⚙): server URL, username, password, and *Test connection*. A server that is not on localhost asks for host permission when you save.

## 4. Other clients

**Python** (no packages needed):

```bash
cd clients/python
python3 darija_client.py --source English "Where is the train station?"
python3 darija_client.py --script latin --speak "See you tomorrow"
python3 darija_client.py            # interactive mode
python3 darija_client.py --gui      # desktop window
python3 -m unittest test_darija_client.py   # tests against the running server
```

**PHP** (PHP 8.1+):

```bash
cd clients/php
php -S localhost:8000               # then open http://localhost:8000
php cli.php "How are you?"
```

**React Native (Expo):**

```bash
cd clients/mobile
npm install
npx expo start                      # scan the QR code with Expo Go, or press a / i / w
```

On a real phone, open ⚙ Settings and set the server to your computer's Wi-Fi address (for example `http://192.168.1.20:8080`). The Android emulator uses `http://10.0.2.2:8080`. The app can paste from the clipboard and translate in one tap, read aloud, copy, share, and keep a history.

All clients accept `DARIJA_URL`, `DARIJA_USER` and `DARIJA_PASSWORD` (PHP and Python) or a Settings screen (extension and mobile).

## 5. How it works

**Request flow.** A client sends `POST /api/translator/translate` with an `Authorization: Basic ...` header. Before the request reaches Jersey, Tomcat's authenticator valve calls our Jakarta Authentication module, `BasicAuthServerAuthModule.validateRequest()`. Because `/api/translator/*` has a security constraint, the container marks the request as *mandatory*. The module decodes the header and checks the password against a PBKDF2 hash in `UserStore`. If the password is right, it hands the caller name and the `user` role to the container through `CallerPrincipalCallback` and `GroupPrincipalCallback`. If not, it writes a JSON 401 itself. Tomcat then checks the role and lets the request through to `TranslatorResource.translate()`.

`TranslationService` checks the input, looks in a 500-entry cache, and builds the prompt. The system prompt asks for everyday Moroccan Darija, not Modern Standard Arabic, and for the translation only. The user's text goes between `<<<` and `>>>` with an instruction to translate it and never obey it. This guards against prompt injection: without it, *"ignore the above and…"* would change what the model does. The prompt goes to the configured `LlmClient` (Gemini or any OpenAI-compatible server).

**Why an embedded Tomcat?** It supports the Jakarta Authentication *Servlet Container Profile*, so the module is a real, portable `ServerAuthModule` and not a hand-made filter. It also lets the whole service ship as one `java -jar` file. Registration uses the standard Jakarta Authentication 3 call, `AuthConfigFactory.getFactory().registerServerAuthModule(module, servletContext)`, so the same module would work on GlassFish, Payara or WildFly.

**Why `X-Requested-With`?** A 401 with `WWW-Authenticate: Basic` makes browsers show their own login pop-up. The extension and the mobile app send `X-Requested-With`, and for those requests the module leaves that header out. The apps then show their own message instead of the browser's box. cURL and Postman still get the standard challenge.

## 6. Tests

```bash
cd server && ./mvnw test
```

`DarijaServerTest` starts the **real** embedded server (Tomcat + Jersey + the Jakarta Authentication module) on a random port, with a fake LLM, and checks these cases over HTTP:

- public health check;
- 401 with no credentials, a wrong password, or an unknown user;
- 200 with the right credentials, including the authenticated user name;
- the GET variant and the cache;
- Unicode round trip;
- 400 for empty text, too-long text, a bad script, or malformed JSON;
- 429 mapping when the LLM quota runs out;
- CORS pre-flight without credentials;
- the `/me` endpoint.

`PasswordHasherTest` covers the hashing.

## Project structure (server)

```
server/src/main/java/ma/aui/darija/
├── Main.java                 start-up, "hash" command
├── DarijaServer.java         embedded Tomcat, security constraint, SAM registration
├── config/AppConfig.java     env / -D / config.properties
├── api/                      Jakarta REST layer
│   ├── TranslatorApplication.java   ResourceConfig (Jersey)
│   ├── TranslatorResource.java      @Path("/translator") translate()
│   ├── HealthResource.java          @Path("/health")
│   ├── TranslationRequest / TranslationResponse / ErrorResponse (records)
│   ├── ApiExceptionMapper.java      exceptions → JSON errors
│   └── CorsFilter.java
├── service/                  TranslationService (prompt + cache), Script, TranslationResult
├── llm/                      LlmClient, GeminiClient, OpenAiCompatibleClient, LlmClientFactory
└── security/                 BasicAuthServerAuthModule (Jakarta Authentication), UserStore, PasswordHasher
```

## Author

El Mehdi Bouzidi Idrissi. Al Akhawayn University, course of Pr. El Habib Nfaoui.
