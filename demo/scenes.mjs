// The demo, scene by scene. Each scene has:
//   title   – shown on the teleprompter
//   say     – the narration you read (text in «…» is something to say out loud for the voice demo)
//   screen  – a short note of what the left side does
//   run()   – the actions played on the recorded Chrome window when you click Next
import fs from 'node:fs';
import path from 'node:path';
import * as d from './director.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = 'server/src/main/java/ma/aui/darija/';
const JAR = 'java -jar target/darija-translator.jar';

/** Line range of the first block that starts at a line matching `from` and ends at the next line matching `to`. */
function lines(file, from, to, extra = 0) {
  const all = fs.readFileSync(path.join(d.ROOT, file), 'utf8').split('\n');
  const a = all.findIndex((l) => from.test(l));
  if (a < 0) throw new Error(`pattern ${from} not found in ${file}`);
  let b = a;
  if (to) { b = all.findIndex((l, i) => i > a && to.test(l)); if (b < 0) b = a; }
  return [a + 1, b + 1 + extra];
}
async function code(file, from, to, note, extra = 0) {
  if (!d.stage.page.url().includes('code.html')) await d.goto('/stage/code.html');
  const [a, b] = lines(file, from, to, extra);
  await d.stage.page.evaluate(({ file, a, b, note }) => window.show(file, a, b, note), { file, a, b, note });
  await sleep(900); // let the smooth scroll finish
}
async function focus(file, from, to, note, extra = 0) {
  const [a, b] = lines(file, from, to, extra);
  await d.stage.page.evaluate(({ a, b, note }) => window.focusLines(a, b, note), { a, b, note });
  await sleep(900);
}
async function diagram(img, title) {
  await d.goto(`/stage/diagram.html?img=/uml/${img}&title=${encodeURIComponent(title)}`);
  await d.stage.page.waitForFunction(() => window.ready === true);
}
const zoom = (x, y, w, h) => d.stage.page.evaluate(([x, y, w, h]) => window.zoomTo(x, y, w, h), [x, y, w, h]);
const panelOutput = () => d.panelEval(`document.querySelector('#output').textContent`);
async function waitTranslation(previous, ms = 90000) {
  await d.panelWait(`(() => { const o = document.querySelector('#output');
    return !o.classList.contains('placeholder') && o.textContent !== ${JSON.stringify(previous ?? '')}
      && document.querySelector('#translateBtn').getAttribute('aria-busy') !== 'true'; })()`, ms);
}
async function waitSpeechEnd(ms = 15000) {
  await sleep(600);
  await d.panelWait(`!speechSynthesis.speaking`, ms).catch(() => {});
}

export const scenes = [
  {
    title: 'Introduction',
    say: `Hello, I'm El Mehdi Bouzidi Idrissi. This is Mini Project 2: an LLM-powered RESTful web service that translates any text into Moroccan Darija. A Java server exposes one secured endpoint, and several clients use it: a Chrome extension, a PHP app, a Python app and a React Native mobile app.`,
    screen: 'Title card.',
    async run() {
      if (!d.stage.page.url().includes('title.html')) await d.goto('/stage/title.html');
    },
  },
  {
    title: 'Architecture',
    say: `This is the deployment diagram. The service runs inside an embedded Tomcat on the JVM, so it ships as a single jar. It asks a large language model for the translation: Gemini in the cloud, or a small local model through LM Studio or Ollama. Every client talks to it over HTTP, with JSON and Basic authentication.`,
    screen: 'Deployment diagram, zooms on the server node, then back out.',
    async run() {
      await diagram('deployment-diagram.png', 'Deployment diagram');
      await sleep(4500);
      await zoom(230, 420, 720, 560);
      await sleep(6000);
      await d.stage.page.evaluate(() => window.fit());
    },
  },
  {
    title: 'The REST endpoint',
    say: `Now the code. The endpoint is TranslatorResource, written with the Jakarta RESTful Web Services API. It is mounted at slash translator, and its translate method consumes and produces JSON. It reads the authenticated user from the security context and hands the work to the translation service.`,
    screen: 'TranslatorResource.java, translate() highlighted.',
    async run() {
      await code(`${J}api/TranslatorResource.java`, /@Path\("\/translator"\)/, /^public class/, '@Path("/translator") · Jakarta REST');
      await sleep(3500);
      await focus(`${J}api/TranslatorResource.java`, /@POST/, /return TranslationResponse.of/, 'translate(): JSON in, JSON out', 1);
    },
  },
  {
    title: 'Prompt and service',
    say: `The service checks the input, keeps a small cache, and builds the prompt. Two details matter here. The prompt asks for everyday Moroccan Darija, not Modern Standard Arabic. And the user's text is placed between markers, so the model translates it instead of obeying any instructions hidden inside it.`,
    screen: 'TranslationService.systemPrompt() highlighted.',
    async run() {
      await code(`${J}service/TranslationService.java`, /static String systemPrompt/, /formatted\(writing\)/, 'Darija, not Fusha · user text fenced in <<< >>>');
      await sleep(5500);
      await focus(`${J}service/TranslationService.java`, /static String userMessage/, /^\s{4}}/, 'The text to translate goes between the markers');
    },
  },
  {
    title: 'The LLM clients',
    say: `The model sits behind an LlmClient interface. GeminiClient calls Google's generateContent API, and OpenAiCompatibleClient talks to local servers such as LM Studio or Ollama. Choosing the provider is a single setting, so the rest of the code never changes.`,
    screen: 'LlmClient interface, then GeminiClient.complete().',
    async run() {
      await code(`${J}llm/LlmClient.java`, /public interface LlmClient/, /^}/, 'One interface, several providers');
      await sleep(4000);
      await code(`${J}llm/GeminiClient.java`, /public String complete/, /return text.toString/, 'Gemini generateContent over HTTPS');
    },
  },
  {
    title: 'Security: Jakarta Authentication',
    say: `Security follows the Jakarta Authentication specification. This class is a ServerAuthModule: the container calls validateRequest before every request. It decodes the Basic header and checks the password against a PBKDF2 hash. On success it hands the caller and the user role to the container through two callbacks. Otherwise it answers 401 with a JSON message.`,
    screen: 'BasicAuthServerAuthModule.validateRequest() highlighted.',
    async run() {
      await code(`${J}security/BasicAuthServerAuthModule.java`, /public AuthStatus validateRequest/, /return AuthStatus.SUCCESS;$/, 'validateRequest(): runs before every request');
      await sleep(5000);
      await focus(`${J}security/BasicAuthServerAuthModule.java`, /handler.handle\(new Callback/, /^\s+}\);/, 'CallerPrincipalCallback + GroupPrincipalCallback');
    },
  },
  {
    title: 'Wiring the server',
    say: `In DarijaServer, a security constraint protects everything under api slash translator for the user role. The module is plugged in with the standard registerServerAuthModule call, so it would work on any Jakarta EE server, not only Tomcat.`,
    screen: 'DarijaServer.java: security constraint, then registerServerAuthModule.',
    async run() {
      await code(`${J}DarijaServer.java`, /\/\/ 2\. Declarative security/, /ctx.setLoginConfig/, 'Security constraint on /api/translator/*');
      await sleep(4500);
      await focus(`${J}DarijaServer.java`, /\/\/ 3\. Jakarta Authentication/, /servletContext\), null\);/, 'AuthConfigFactory.registerServerAuthModule(...)');
    },
  },
  {
    title: 'Build and test',
    say: `Let's build and run the tests with the Maven wrapper. The main test starts the real server on a random port, with a fake model, and checks authentication, validation and the error codes over HTTP. All twenty tests pass.`,
    screen: 'Terminal: ./mvnw test, filtered to the test summary.',
    async run() {
      await d.terminal('darija-translator — zsh');
      await d.stage.page.evaluate(() => term.clear());
      await d.run('./mvnw test 2>&1 | grep -E "Tests run:|BUILD"', { cwd: path.join(d.ROOT, 'server'), label: 'darija-translator/server' });
    },
  },
  {
    title: 'Start the service',
    say: `Now I start the service. It's one command. The embedded Tomcat starts on port 8080, and the banner shows which language model is connected.`,
    screen: 'Terminal: java -jar target/darija-translator.jar, banner appears.',
    async run() {
      await d.stage.page.evaluate(() => term.clear());
      const { child } = await d.run(JAR, { cwd: path.join(d.ROOT, 'server'), label: 'darija-translator/server', until: /Users loaded/ });
      d.stage.serverProc = child;
      await sleep(600);
    },
  },
  {
    title: 'Testing with cURL',
    say: `Let's call it with cURL. Without credentials, the authentication module answers 401. A wrong password is also refused. With the student account, we get the translation as JSON, with the provider, the timing and the name of the authenticated user.`,
    screen: 'Terminal: three curl calls — 401, 401, then 200 with the Darija translation.',
    async run() {
      await d.stage.page.evaluate(() => { term.clear(); term.title('curl — zsh'); });
      const api = 'http://localhost:8080/api/translator/translate';
      const opts = { cwd: d.ROOT, label: '~' };
      await d.run(`curl -s -w "  → HTTP %{http_code}\\n" -H "Content-Type: application/json" -d '{"text":"Good morning"}' ${api}`, opts);
      await d.run(`curl -s -w "  → HTTP %{http_code}\\n" -u student:wrong -H "Content-Type: application/json" -d '{"text":"Good morning"}' ${api}`, opts);
      await d.run(`curl -s -u student:darija2026 -H "Content-Type: application/json" -d '{"text":"How are you? I hope your family is doing well.","source":"English"}' ${api} | python3 -m json.tool --no-ensure-ascii`, opts);
    },
  },
  {
    title: 'Chrome extension: right-click',
    say: (mode) => mode === 'real'
      ? `Now the Chrome extension, built with Manifest V3. I select a paragraph on a web page, right-click, and choose Translate to Darija. The side panel opens next to the page. The selected text is pasted automatically and translated right away.`
      : `Now the Chrome extension, built with Manifest V3. I select a paragraph on a web page. The extension adds a Translate to Darija item to the right-click menu. Choosing it opens the side panel next to the page, pastes the selected text automatically, and translates it.`,
    screen: 'Article page: a paragraph is selected, the side panel opens and shows the Darija translation.',
    async run() {
      await d.goto('/stage/article.html');
      await sleep(800);
      const pts = await d.dragSelect('#p1');
      await sleep(500);
      const text = await d.stage.page.evaluate(() => getSelection().toString().trim());
      if (d.stage.mode === 'real') {
        const back = d.osInput.call('pos').split(' ');
        const s = await d.toScreen(pts.x2 - 30, pts.y2);
        d.osInput.call('rightclick', Math.round(s.x), Math.round(s.y));
        await sleep(300);
        const res = d.osInput.call('menuitem', d.stage.chromePid, 'to Darija');
        if (res !== 'clicked') throw new Error('menu item not found');
        await sleep(400);
        d.osInput.call('move', back[0], back[1], '350');
        await d.attachPanelWhenOpen();
      } else {
        await d.stage.page.evaluate(({ x, y }) => document.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, button: 2 })), { x: pts.x2 - 30, y: pts.y2 });
        await sleep(400);
        await d.openPanel();
        await sleep(300);
        await d.handOff(text);
      }
      await waitTranslation('');
    },
  },
  {
    title: 'Live selection',
    say: `While the panel is open, I don't even need the menu. Any text I select on the page is copied into the panel automatically, and translated.`,
    screen: 'A second paragraph is selected; it appears in the panel and is translated.',
    async run() {
      const before = await panelOutput();
      await d.dragSelect('#p3');
      await waitTranslation(before);
    },
  },
  {
    title: 'Latin script and read aloud',
    say: `I can switch the output to Latin letters, the way Moroccans write Darija in text messages, and back to Arabic script. The read-aloud button uses the browser's speech synthesis to speak the translation.`,
    screen: 'Panel: Latin toggle, back to Arabic, then Read aloud.',
    async run() {
      let before = await panelOutput();
      await d.panelClick('#scriptLatin');
      await waitTranslation(before);
      await sleep(2500);
      before = await panelOutput();
      await d.panelClick('#scriptArabic');
      await waitTranslation(before).catch(() => {});
      await sleep(600);
      await d.panelClick('#speakBtn');
      await waitSpeechEnd();
    },
  },
  {
    title: 'Voice-to-voice translation',
    say: `Voice-to-voice translation. I click the button and speak: «Where is the nearest pharmacy?» The extension recognises my voice, translates the sentence, and reads the Darija back to me.`,
    screen: 'Panel: Voice to voice → listens to your microphone → translates → speaks. (If nothing is heard, the sentence is typed for you.)',
    async run() {
      await d.panelClick('#clearBtn');
      const before = await panelOutput();
      await d.panelClick('#voiceBtn');
      await sleep(1000);
      // wait for the recognition to finish (the button label returns to normal)
      await d.panelWait(`!document.querySelector('#voiceBtn').textContent.includes('Listening')`, 20000).catch(() => {});
      const heard = await d.panelEval(`document.querySelector('#input').value.trim()`);
      if (!heard) {
        // nothing recognised: type the sentence so the demo continues
        await d.panelType('#input', 'Where is the nearest pharmacy?');
        await d.panelClick('#translateBtn');
        await waitTranslation(before);
        await d.panelClick('#speakBtn');
      } else {
        await waitTranslation(before);
      }
      await waitSpeechEnd();
    },
  },
  {
    title: 'Extension settings',
    say: `In the settings page I set the server address and my credentials. They are stored only in this browser. The test button checks the login without spending any model quota.`,
    screen: 'Options page opens; Test connection shows "Connected".',
    async run() {
      const opened = d.stage.ctx.waitForEvent('page', { predicate: (p) => p.url().includes('options.html') && !p.url().includes('demo-helper'), timeout: 15000 });
      opened.catch(() => {});
      await d.panelClick('#settingsBtn');
      const opts = await opened;
      await opts.waitForLoadState();
      d.stage.mouse = { x: 640, y: 300 };
      const prev = d.stage.page;
      d.stage.page = opts;
      try {
        await d.click(opts.locator('#test'));
        await opts.waitForFunction(() => document.querySelector('#result').textContent.startsWith('Connected'), null, { timeout: 15000 });
        await sleep(3500);
      } finally {
        d.stage.page = prev;
        await opts.close();
      }
    },
  },
  {
    title: 'PHP client',
    say: `The same endpoint from PHP. This page sends the text with cURL from the server side and shows the result, with a read-aloud button as well.`,
    screen: 'PHP page: type a sentence, Translate, result appears.',
    async run() {
      await d.closePanel();
      await d.goto('http://localhost:8000/');
      d.stage.mouse = { x: 640, y: 120 };
      await d.click(d.stage.page.locator('textarea'));
      await d.stage.page.keyboard.type('The train to Marrakech leaves at eight in the morning.', { delay: 28 });
      await d.click(d.stage.page.locator('button[type=submit]'));
      await d.stage.page.waitForSelector('#output', { timeout: 90000 });
      await sleep(1200);
      await d.click(d.stage.page.locator('#speak'));
      await sleep(4000);
    },
  },
  {
    title: 'Python client',
    say: `The Python client uses only the standard library. From the command line I translate a sentence into Arabic script, then another one in Latin letters.`,
    screen: 'Terminal: python3 darija_client.py, Arabic then Latin.',
    async run() {
      await d.terminal('python — zsh');
      await d.stage.page.evaluate(() => term.clear());
      const opts = { cwd: path.join(d.ROOT, 'clients/python'), label: 'darija-translator/clients/python' };
      await d.run(`python3 darija_client.py --source English "See you tomorrow at the café"`, opts);
      await d.run(`python3 darija_client.py --script latin "Good night and sweet dreams"`, opts);
    },
  },
  {
    title: 'React Native mobile app',
    say: `Finally, the React Native app, built with Expo. The same code runs on Android, iOS and the web; this is the web build. I type a sentence, translate it, and play it aloud. Recent translations are kept in a history.`,
    screen: 'Phone frame: type, Translate, Read aloud, history.',
    async run() {
      await d.goto('/stage/phone.html');
      const app = d.stage.page.frameLocator('#app');
      const input = app.getByPlaceholder('Text to translate into Darija…');
      await input.waitFor({ timeout: 60000 });
      d.stage.mouse = { x: 640, y: 200 };
      await d.click(input);
      await d.stage.page.keyboard.type('Thank you for your help, my friend!', { delay: 30 });
      await d.click(app.getByText('Translate', { exact: true }));
      await app.getByText('Read aloud', { exact: false }).waitFor({ timeout: 90000 });
      await sleep(1000);
      await d.click(app.getByText('Read aloud', { exact: false }));
      await sleep(4500);
    },
  },
  {
    title: 'Wrap-up',
    say: `To sum up: a Jakarta REST service secured with Jakarta Authentication, powered by a large language model, with a Chrome extension, PHP, Python and mobile clients. The source code, UML diagrams and README are on GitHub. Thank you for watching.`,
    screen: 'Class diagram, then the closing card.',
    async run() {
      await diagram('class-diagram.png', 'Class diagram');
      await sleep(6000);
      await d.goto('/stage/end.html');
    },
  },
];
