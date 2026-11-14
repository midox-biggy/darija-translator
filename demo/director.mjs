// Demo director: plays the 5-minute project demo one scene at a time.
//
//   left  of the screen: a Chrome window (the "stage") that you record
//   right of the screen: a teleprompter with the narration and a Next button (not recorded)
//
// Run:  cd demo && npm install && npm start
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scenes } from './scenes.mjs';

const DEMO = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(DEMO, '..');
const PORT = Number(process.env.DEMO_PORT || 4000);
const STAGE_W = Number(process.env.STAGE_W || 1280);
const STAGE_H = Number(process.env.STAGE_H || 800);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ------------------------------------------------------------------ state + teleprompter feed
const state = { index: 0, total: scenes.length, status: 'starting', checks: [], error: null };
const listeners = new Set();
function publish() {
  const scene = state.index === 0 ? setupScene() : scenes[state.index - 1];
  const next = state.index < scenes.length ? scenes[state.index] : null;
  const payload = JSON.stringify({
    index: state.index, total: scenes.length, status: state.status, error: state.error,
    checks: state.index === 0 ? state.checks : null,
    scene: { title: scene.title, say: typeof scene.say === 'function' ? scene.say(stage.mode) : scene.say, screen: scene.screen, html: scene.html },
    nextTitle: next?.title,
  });
  for (const res of listeners) res.write(`data: ${payload}\n\n`);
}
function setupScene() {
  return {
    title: 'Before you record',
    html: `<ol>
      <li>Wait until every line above shows ✓.</li>
      <li>Open <b>QuickTime Player → File → New Screen Recording</b>.</li>
      <li>Choose <b>Record Selected Portion</b> and drag the frame over the <b>Chrome window on the left</b> (not this panel).</li>
      <li>In <b>Options</b>, pick your microphone so your voice is recorded.</li>
      <li>Click <b>Record</b>, then click <b>Start ▶</b> here.</li>
    </ol>
    <p>Each time you click <b>Next</b>, the left side plays the next part and this panel shows what to say.
    Read the white text at a calm pace; wait for the status to show <i>ready</i> before clicking Next.</p>`,
  };
}
function check(label, stateName, detail) {
  const c = state.checks.find((x) => x.label === label);
  if (c) Object.assign(c, { state: stateName, detail }); else state.checks.push({ label, state: stateName, detail });
  publish();
}

// ------------------------------------------------------------------ local web server
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.mjs': 'text/javascript' };
const STATIC = { '/stage/': path.join(DEMO, 'stage'), '/ext/': path.join(ROOT, 'chrome-extension'),
  '/hl/': path.join(DEMO, 'node_modules/@highlightjs/cdn-assets'), '/uml/': path.join(ROOT, 'docs/uml') };
let onNext = null, onRepeat = null;

function insideRoot(p) {
  const full = path.resolve(ROOT, p);
  if (!full.startsWith(ROOT + path.sep) || full.includes(`${path.sep}node_modules${path.sep}`)) throw new Error('forbidden');
  return full;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      listeners.add(res);
      req.on('close', () => listeners.delete(res));
      publish();
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/next') { res.end('ok'); onNext?.(); return; }
    if (req.method === 'POST' && url.pathname === '/api/repeat') { res.end('ok'); onRepeat?.(); return; }
    if (url.pathname === '/api/file') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(fs.readFileSync(insideRoot(url.searchParams.get('path')), 'utf8'));
      return;
    }
    if (url.pathname === '/api/siblings') {
      const dir = path.dirname(insideRoot(url.searchParams.get('path')));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(fs.readdirSync(dir).filter((n) => !n.startsWith('.')).sort()));
      return;
    }
    for (const [prefix, dir] of Object.entries(STATIC)) {
      if (url.pathname.startsWith(prefix)) {
        const file = path.resolve(dir, decodeURIComponent(url.pathname.slice(prefix.length)));
        if (!file.startsWith(dir)) break;
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(fs.readFileSync(file));
        return;
      }
    }
    res.writeHead(404).end('not found');
  } catch (e) {
    res.writeHead(e.message === 'forbidden' ? 403 : 404).end(e.message);
  }
});

// ------------------------------------------------------------------ child processes
const children = new Set();
function startProcess(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'], detached: false });
  children.add(child);
  child.on('exit', () => children.delete(child));
  return child;
}
function cleanup() {
  for (const c of children) { try { c.kill('SIGTERM'); } catch {} }
  try { execFileSync('docker', ['rm', '-f', 'darija-demo-php'], { stdio: 'ignore' }); } catch {}
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

const portOpen = (port) => new Promise((resolve) => {
  const s = net.connect(port, '127.0.0.1');
  s.once('connect', () => { s.destroy(); resolve(true); });
  s.once('error', () => resolve(false));
});
async function waitPort(port, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await portOpen(port)) return true; await sleep(400); }
  return false;
}
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r(?!\n)/g, '\n');

// ------------------------------------------------------------------ the stage (Chrome) and its helpers
export const stage = {
  ctx: null, page: null, bcdp: null, sw: null, extId: null, windowId: null, helper: null, panelSession: null,
  mouse: { x: 640, y: 400 }, mode: 'assisted', serverProc: null,
};

async function launchChrome() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'darija-demo-profile-'));
  stage.profile = profile;
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: 'chrome', headless: false, viewport: null,
    args: ['--enable-unsafe-extension-debugging', '--no-first-run', '--no-default-browser-check',
      '--use-fake-ui-for-media-stream', '--disable-features=Translate,AutofillServerCommunication',
      '--hide-crash-restore-bubble', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling', `--window-position=0,0`, `--window-size=${STAGE_W},${STAGE_H}`],
    ignoreDefaultArgs: ['--disable-extensions', '--disable-component-extensions-with-background-pages', '--enable-automation'],
  });
  stage.ctx = ctx;
  stage.bcdp = await ctx.browser().newBrowserCDPSession();
  const { id } = await stage.bcdp.send('Extensions.loadUnpacked', { path: path.join(ROOT, 'chrome-extension') });
  stage.extId = id;
  await ctx.addInitScript({ path: path.join(DEMO, 'stage/cursor.js') });
  for (let i = 0; i < 40 && !stage.sw; i++) {
    stage.sw = ctx.serviceWorkers().find((w) => w.url().includes(id));
    if (!stage.sw) await sleep(150);
  }
  stage.page = ctx.pages()[0];
  await stage.page.goto(`http://localhost:${PORT}/stage/title.html`);

  // Window layout: stage on the left at exactly STAGE_W x STAGE_H, teleprompter in the remaining width.
  const scr = await stage.page.evaluate(() => ({ w: screen.availWidth, h: screen.availHeight, x: screen.availLeft, y: screen.availTop }));
  stage.windowId = await stage.sw.evaluate(async ({ x, y, w, h }) => {
    const [win] = await chrome.windows.getAll({ windowTypes: ['normal'] });
    await chrome.windows.update(win.id, { left: x, top: y, width: w, height: h, state: 'normal' });
    return win.id;
  }, { x: scr.x, y: scr.y, w: STAGE_W, h: Math.min(STAGE_H, scr.h) });
  const pw = Math.max(380, scr.w - STAGE_W - 8);
  await stage.sw.evaluate(({ url, left, top, width, height }) =>
    chrome.windows.create({ url, type: 'popup', left, top, width, height, focused: true }),
  { url: `http://localhost:${PORT}/stage/prompter.html`, left: scr.x + scr.w - pw, top: scr.y, width: pw, height: scr.h });
  // A minimized window holding an extension page: lets us open the side panel with a "user gesture".
  await stage.sw.evaluate(() => chrome.windows.create({ url: 'options.html?demo-helper', state: 'minimized' }));
  for (let i = 0; i < 40 && !stage.helper; i++) {
    stage.helper = ctx.pages().find((p) => p.url().includes('demo-helper'));
    if (!stage.helper) await sleep(150);
  }
  stage.helperCdp = await ctx.newCDPSession(stage.helper);
  // main Chrome process id (needed to find its context menu through the Accessibility API)
  try {
    const pids = execFileSync('pgrep', ['-f', profile], { encoding: 'utf8' }).trim().split('\n');
    stage.chromePid = pids.find((p) => !execFileSync('ps', ['-o', 'command=', '-p', p], { encoding: 'utf8' }).includes('--type='));
  } catch {}
  // Ask macOS for the microphone now (if Chrome never had it), not in the middle of the recording.
  await stage.page.evaluate(() => navigator.mediaDevices.getUserMedia({ audio: true })
    .then((s) => { s.getTracks().forEach((t) => t.stop()); return true; }, () => false)).catch(() => false);
  log('Chrome ready, extension', id, 'screen', scr);
}

export async function focusStage() {
  await stage.sw.evaluate((id) => chrome.windows.update(id, { focused: true }), stage.windowId).catch(() => {});
  // make Chrome the frontmost app, so real mouse events land in it
  if (stage.chromePid) {
    try { execFileSync('osascript', ['-e', `tell application "System Events" to set frontmost of (first process whose unix id is ${stage.chromePid}) to true`], { stdio: 'ignore' }); } catch {}
  }
}
export async function focusPrompter() {
  await stage.sw.evaluate(async () => {
    const [p] = await chrome.windows.getAll({ windowTypes: ['popup'] });
    if (p) await chrome.windows.update(p.id, { focused: true });
  }).catch(() => {});
}

export async function goto(urlPath) {
  const url = /^[a-z-]+:\/\//.test(urlPath) ? urlPath : `http://localhost:${PORT}${urlPath}`;
  await stage.page.goto(url);
  await stage.page.waitForFunction(() => document.readyState === 'complete');
}

/** Smoothly moves the visible cursor (and the real Playwright mouse) to page coordinates. */
export async function moveTo(x, y, ms = 650) {
  const steps = Math.max(8, Math.round(ms / 16));
  const { x: x0, y: y0 } = stage.mouse;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    await stage.page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e);
    await sleep(ms / steps);
  }
  stage.mouse = { x, y };
}
export async function clickAt(x, y, opts = {}) {
  await moveTo(x, y, opts.ms ?? 600);
  await stage.page.mouse.click(x, y, opts);
}
export async function click(locator, opts = {}) {
  const box = await locator.boundingBox();
  await clickAt(box.x + box.width / 2, box.y + box.height / 2, opts);
}

/** Drag-selects the text of an element (like a user would), from its first to its last character. */
export async function dragSelect(selector) {
  const pts = await stage.page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const r = document.createRange(); r.selectNodeContents(el);
    const rects = [...r.getClientRects()].filter((x) => x.width > 0);
    const a = rects[0], b = rects.at(-1);
    return { x1: a.left + 1, y1: a.top + a.height / 2, x2: b.right - 1, y2: b.top + b.height / 2 };
  }, selector);
  await moveTo(pts.x1, pts.y1);
  await stage.page.mouse.down();
  const steps = 40;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await stage.page.mouse.move(pts.x1 + (pts.x2 - pts.x1) * t, pts.y1 + (pts.y2 - pts.y1) * t);
    await sleep(18);
  }
  await stage.page.mouse.up();
  stage.mouse = { x: pts.x2, y: pts.y2 };
  return pts;
}

// ----- terminal page
export async function terminal(title) {
  if (!stage.page.url().includes('terminal.html')) await goto('/stage/terminal.html');
  if (title) await stage.page.evaluate((t) => term.title(t), title);
}
/**
 * Types `display` (default `cmd`) into the terminal page, runs `cmd` for real, and streams its output.
 * until: a RegExp — resolve once the output matches and keep the process running (for servers).
 */
export async function run(cmd, { cwd = ROOT, display = cmd, until, env, label, keepOutput = true } = {}) {
  const where = label || path.relative(path.dirname(ROOT), cwd);
  await stage.page.evaluate((w) => term.prompt(w), where);
  await stage.page.evaluate((c) => term.type(c), display);
  const child = startProcess('/bin/zsh', ['-c', cmd], { cwd, env: { ...process.env, ...env } });
  let buffer = '', all = '', flushing = false, done = false;
  const flush = async () => {
    if (flushing || !buffer) return;
    flushing = true;
    const chunk = buffer; buffer = '';
    if (keepOutput) await stage.page.evaluate((t) => term.write(t), chunk).catch(() => {});
    flushing = false;
  };
  const timer = setInterval(flush, 60);
  const onData = (d) => { const t = stripAnsi(d.toString()); if (!done) buffer += t; all += t; };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  await new Promise((resolve) => {
    if (until) {
      const iv = setInterval(() => { if (until.test(all)) { clearInterval(iv); resolve(); } }, 100);
      child.on('exit', () => { clearInterval(iv); resolve(); });
    } else child.on('exit', resolve);
  });
  await sleep(150);
  await flush();
  done = true;
  clearInterval(timer);
  return { child, output: all };
}

// ----- side panel (driven over the DevTools protocol)
let msgId = 0;
const pending = new Map();
async function panelSend(method, params = {}) {
  if (!stage.panelSession) await attachPanel();
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    stage.bcdp.send('Target.sendMessageToTarget', { sessionId: stage.panelSession, message: JSON.stringify({ id, method, params }) })
      .catch(reject);
  });
}
export async function attachPanelWhenOpen() { return attachPanel(); }
async function attachPanel() {
  for (let i = 0; i < 50; i++) {
    if (stage.panelSession) return;
    const { targetInfos } = await stage.bcdp.send('Target.getTargets');
    const t = targetInfos.find((x) => x.url.includes(`${stage.extId}/sidepanel.html`));
    if (t) {
      if (!stage.panelListener) {
        stage.panelListener = true;
        stage.bcdp.on('Target.receivedMessageFromTarget', (ev) => {
          const m = JSON.parse(ev.message);
          if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
          if (m.method === 'Page.screencastFrame' && ev.sessionId === stage.panelSession) {
            saveFrame('panel', m.params);
            panelSend('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {});
          }
        });
      }
      const { sessionId } = await stage.bcdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: false });
      stage.panelSession = sessionId;
      await panelEval(`document.readyState === 'complete' || new Promise(r => addEventListener('load', r))`);
      await panelEval(fs.readFileSync(path.join(DEMO, 'stage/cursor.js'), 'utf8'));
      stage.panelMouse = { x: 200, y: 300 };
      if (capture.on) {
        capEvent('panel', { open: true });
        await panelSend('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1000, maxHeight: 1400, everyNthFrame: 1 });
      }
      return;
    }
    await sleep(150);
  }
  throw new Error('side panel did not open');
}
export async function panelEval(expression) {
  const r = await panelSend('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'panel eval failed');
  return r.result.value;
}
export async function panelWait(expression, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await panelEval(expression).catch(() => false)) return true;
    await sleep(200);
  }
  throw new Error('timed out waiting for: ' + expression);
}
async function panelMove(x, y, ms = 550) {
  const steps = Math.max(8, Math.round(ms / 16));
  const { x: x0, y: y0 } = stage.panelMouse;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    await panelSend('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + (x - x0) * e, y: y0 + (y - y0) * e });
    await sleep(ms / steps);
  }
  stage.panelMouse = { x, y };
}
export async function panelClick(selector) {
  const r = await panelEval(`(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  await panelMove(r.x, r.y);
  await panelSend('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await sleep(60);
  await panelSend('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
}
export async function panelType(selector, text) {
  await panelClick(selector);
  await panelEval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ''; el.dispatchEvent(new Event('input')); })()`);
  for (const ch of text) { await panelSend('Input.insertText', { text: ch }); await sleep(35 + Math.random() * 30); }
}
export async function openPanel() {
  const r = await stage.helperCdp.send('Runtime.evaluate', {
    expression: `chrome.sidePanel.open({ windowId: ${stage.windowId} }).then(() => 'ok', (e) => e.message)`,
    awaitPromise: true, userGesture: true, returnByValue: true });
  if (r.result.value !== 'ok') throw new Error('sidePanel.open: ' + r.result.value);
  await attachPanel();
}
export async function closePanel() {
  if (stage.panelSession) capEvent('panel', { open: false });
  stage.panelSession = null;
  await stage.helperCdp.send('Runtime.evaluate', {
    expression: `(async () => {
      if (chrome.sidePanel.close) { try { await chrome.sidePanel.close({ windowId: ${stage.windowId} }); return; } catch {} }
      await chrome.sidePanel.setOptions({ enabled: false }); await chrome.sidePanel.setOptions({ enabled: true, path: 'sidepanel.html' });
    })()`, awaitPromise: true, userGesture: true });
  await sleep(300);
}
/** Same hand-off the extension's service worker performs after "Translate to Darija" is chosen. */
export async function handOff(text, origin = 'context menu') {
  await stage.sw.evaluate(async ({ text, origin }) => {
    const pending = { text, origin, at: Date.now() };
    await chrome.storage.session.set({ pending });
    await chrome.runtime.sendMessage({ type: 'translate-text', ...pending }).catch(() => {});
  }, { text, origin });
}

// ----- real OS input (only when macOS Accessibility permission is granted)
const OSINPUT = path.join(DEMO, '.bin/osinput');
export const osInput = {
  available: false,
  call(...args) { return execFileSync(OSINPUT, args.map(String), { encoding: 'utf8' }).trim(); },
};
function prepareOsInput() {
  try {
    const src = path.join(DEMO, 'tools/osinput.swift');
    if (!fs.existsSync(OSINPUT) || fs.statSync(OSINPUT).mtimeMs < fs.statSync(src).mtimeMs) {
      fs.mkdirSync(path.dirname(OSINPUT), { recursive: true });
      execFileSync('swiftc', ['-O', '-o', OSINPUT, src], { stdio: 'ignore' });
    }
    osInput.available = osInput.call('trusted') === 'yes';
  } catch { osInput.available = false; }
  stage.mode = osInput.available ? 'real' : 'assisted';
  return osInput.available;
}
/** Converts page (CSS) coordinates of the stage tab to screen coordinates. */
export async function toScreen(x, y) {
  return stage.page.evaluate(({ x, y }) => ({
    x: window.screenX + (window.outerWidth - window.innerWidth) / 2 + x,
    y: window.screenY + (window.outerHeight - window.innerHeight) + y,
  }), { x, y });
}

// ------------------------------------------------------------------ boot sequence
async function boot() {
  server.listen(PORT);
  log(`teleprompter feed on http://localhost:${PORT}`);
  publish();

  // 1. Translation server jar + LLM
  check('Server jar', 'wait');
  const jar = path.join(ROOT, 'server/target/darija-translator.jar');
  try {
    execFileSync('pkill', ['-f', 'darija-translator.jar'], { stdio: 'ignore' });
  } catch {}
  execFileSync('./mvnw', ['-q', '-DskipTests', 'package'], { cwd: path.join(ROOT, 'server'), stdio: 'ignore' });
  if (!fs.existsSync(jar)) throw new Error('could not build the server jar');
  check('Server jar', 'ok', 'built and compiled');

  check('LLM', 'wait');
  const llm = await import('./llm-check.mjs').then((m) => m.warmUp(ROOT)).catch((e) => ({ ok: false, detail: e.message }));
  check('LLM', llm.ok ? 'ok' : 'bad', llm.detail);

  // 2. PHP web client in Docker (PHP is not installed on this Mac)
  check('PHP client (Docker, port 8000)', 'wait');
  try {
    execFileSync('docker', ['rm', '-f', 'darija-demo-php'], { stdio: 'ignore' });
    execFileSync('docker', ['run', '-d', '--rm', '--name', 'darija-demo-php', '-p', '8000:8000', '-v', `${path.join(ROOT, 'clients/php')}:/app`,
      '-w', '/app', '-e', 'DARIJA_URL=http://host.docker.internal:8080', 'php:8.3-cli', 'php', '-S', '0.0.0.0:8000'], { stdio: 'ignore' });
    check('PHP client (Docker, port 8000)', (await waitPort(8000, 15000)) ? 'ok' : 'bad');
  } catch (e) {
    check('PHP client (Docker, port 8000)', 'bad', 'start Docker Desktop, then restart the demo');
  }

  // 3. Expo web build of the mobile app
  check('Mobile app (Expo web, port 8081)', 'wait');
  const mobile = path.join(ROOT, 'clients/mobile');
  if (!fs.existsSync(path.join(mobile, 'node_modules'))) execFileSync('npm', ['install'], { cwd: mobile, stdio: 'ignore' });
  if (!(await portOpen(8081))) startProcess('npx', ['expo', 'start', '--web', '--port', '8081'], { cwd: mobile, env: { ...process.env, CI: '1', BROWSER: 'none' } });
  const expoUp = await waitPort(8081, 90000);
  if (expoUp) {
    // ask Metro to build the web bundle now, so the scene does not wait for it
    const html = await fetch('http://localhost:8081').then((r) => r.text()).catch(() => '');
    const src = html.match(/src="([^"]+\.bundle[^"]*)"/)?.[1];
    if (src) await fetch(new URL(src, 'http://localhost:8081')).then((r) => r.text()).catch(() => {});
  }
  check('Mobile app (Expo web, port 8081)', expoUp ? 'ok' : 'bad');

  // 4. Chrome stage + teleprompter
  check('Chrome with the extension', 'wait');
  await launchChrome();
  check('Chrome with the extension', 'ok', 'stage on the left, this panel on the right');

  // 5. Real right-click needs Accessibility permission
  const real = prepareOsInput();
  check('Real right-click menu', real ? 'ok' : 'bad',
    real ? 'Accessibility permission granted' : 'no Accessibility permission: the menu step is simulated (see README)');

  state.status = 'ready';
  publish();
}

// Debug aid: DEMO_SHOTS=<dir> saves a screenshot of the stage tab (and the side panel, if open) after every scene.
async function snapshot(i) {
  const dir = process.env.DEMO_SHOTS;
  fs.mkdirSync(dir, { recursive: true });
  const n = String(i).padStart(2, '0');
  await stage.page.screenshot({ path: path.join(dir, `${n}-stage.png`) });
  if (stage.panelSession) {
    const { data } = await panelSend('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(dir, `${n}-panel.png`), Buffer.from(data, 'base64'));
  }
}

// ------------------------------------------------------------------ scene loop
let busy = false;
async function play(i) {
  busy = true;
  state.index = i;
  state.status = 'running';
  state.error = null;
  publish();
  try {
    await focusStage();
    await scenes[i - 1].run();
    state.status = i === scenes.length ? 'done' : 'ready';
    if (process.env.DEMO_SHOTS) await snapshot(i).catch((e) => log('snapshot failed', e.message));
  } catch (e) {
    log('scene error', e);
    state.status = 'ready';
    state.error = `This step hit a problem (${e.message}). Click ↺ Repeat or Next.`;
  }
  await focusPrompter();
  busy = false;
  publish();
}
onNext = () => { if (!busy && state.status !== 'starting' && state.index < scenes.length) play(state.index + 1); };
onRepeat = () => { if (!busy && state.index > 0) play(state.index); };

// ------------------------------------------------------------------ frame capture (no screen-recording permission needed)
// Chrome streams every painted frame of the page and of the side panel over the DevTools protocol
// (Page.startScreencast). compose.py later lays them out as a browser window.
export const capture = { on: false, dir: null, frames: [], events: [], n: 0 };
export function capEvent(type, data = {}) { if (capture.on) capture.events.push({ t: Date.now() / 1000, type, ...data }); }
function saveFrame(src, f) {
  if (!capture.on) return;
  const file = `${src}-${String(++capture.n).padStart(6, '0')}.jpg`;
  fs.writeFileSync(path.join(capture.dir, 'frames', file), Buffer.from(f.data, 'base64'));
  capture.frames.push({ src, t: f.metadata.timestamp, file, cssW: f.metadata.deviceWidth, cssH: f.metadata.deviceHeight });
}
async function startFrameCapture(dir) {
  capture.dir = dir;
  fs.rmSync(path.join(dir, 'frames'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'frames'), { recursive: true });
  capture.on = true;
  const cast = await stage.ctx.newCDPSession(stage.page);
  cast.on('Page.screencastFrame', (f) => { saveFrame('page', f); cast.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
  await cast.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 2000, maxHeight: 1400, everyNthFrame: 1 });
  const onLoad = async () => capEvent('url', { url: stage.page.url(), title: await stage.page.title().catch(() => '') });
  stage.page.on('load', onLoad);
  await onLoad();
  if (stage.panelSession) {
    capEvent('panel', { open: true });
    await panelSend('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1000, maxHeight: 1400, everyNthFrame: 1 });
  }
  return cast;
}

// ------------------------------------------------------------------ recording mode
// DEMO_RECORD=<folder>: plays every scene by itself while ffmpeg records the Chrome window, and writes
// timeline.json (start/end of each scene) so captions and narration can be added afterwards.
export function narration() {
  return scenes.map((s, i) => ({ index: i + 1, title: s.title, say: (typeof s.say === 'function' ? s.say(stage.mode) : s.say).replace(/[«»]/g, '"') }));
}
function readingSeconds(text) { return text.split(/\s+/).length / 2.6 + 1.2; }

async function screenDeviceIndex() {
  const out = await new Promise((resolve) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', '']);
    let t = ''; p.stderr.on('data', (d) => (t += d)); p.on('exit', () => resolve(t));
  });
  return out.match(/\[(\d+)\] Capture screen 0/)?.[1] ?? '1';
}

async function record(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const durations = fs.existsSync(path.join(dir, 'durations.json'))
    ? JSON.parse(fs.readFileSync(path.join(dir, 'durations.json'), 'utf8')) : {};
  const g = await stage.page.evaluate(() => ({ x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight, r: window.devicePixelRatio }));
  // park the real mouse pointer over the teleprompter, away from the stage
  if (osInput.available) try { osInput.call('move', String(g.x + g.w + 200), String(g.y + 300), '200'); } catch {}
  await focusStage();

  const useScreen = process.env.DEMO_CAPTURE === 'screen';
  let ff = null, cast = null, t0;
  const crop = { x: Math.round(g.x * g.r), y: Math.round(g.y * g.r), w: Math.round(g.w * g.r) & ~1, h: Math.round(g.h * g.r) & ~1 };
  if (useScreen) {
    const idx = await screenDeviceIndex();
    ff = spawn('ffmpeg', ['-y', '-hide_banner', '-f', 'avfoundation', '-pixel_format', 'bgr0', '-capture_cursor', '1', '-framerate', '30', '-i', `${idx}:none`,
      '-vf', `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`, '-c:v', 'h264_videotoolbox', '-b:v', '18M', '-pix_fmt', 'yuv420p',
      path.join(dir, 'raw.mp4')], { stdio: ['pipe', 'ignore', 'pipe'] });
    let errText = '';
    ff.stderr.on('data', (d) => { errText += d; if (!t0 && /frame=\s*\d+/.test(String(d))) t0 = Date.now(); });
    for (let i = 0; i < 100 && !t0; i++) await sleep(100);
    if (!t0) { ff.kill(); throw new Error('screen recording did not start: ' + errText.slice(-300)); }
  } else {
    t0 = Date.now();
    cast = await startFrameCapture(dir);
  }
  const now = () => (Date.now() - t0) / 1000;
  log('recording with', useScreen ? 'screen capture' : 'Chrome frame capture');
  const timeline = [];
  await sleep(1500);                                   // a moment on the title card before the first scene
  const story = narration();
  for (let i = 1; i <= scenes.length; i++) {
    const start = now();
    const target = durations[i] ?? readingSeconds(story[i - 1].say);
    await play(i);
    if (state.error) log('ERROR in scene', i, state.error);
    const left = target + 0.3 - (now() - start);
    if (left > 0) await sleep(left * 1000);
    timeline.push({ ...story[i - 1], start, end: now() });
    log(`scene ${i} ${start.toFixed(1)}–${now().toFixed(1)} s${state.error ? '  (error)' : ''}`);
  }
  await sleep(3000);                                   // hold the closing card
  timeline.push({ index: 'end', start: now(), end: now() });
  if (ff) { ff.stdin.write('q'); await new Promise((r) => ff.on('exit', r)); }
  if (cast) {
    await cast.send('Page.stopScreencast').catch(() => {});
    capture.on = false;
    fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify({ t0: t0 / 1000, frames: capture.frames, events: capture.events }, null, 1));
  }
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify({ capture: useScreen ? 'screen' : 'frames', crop, scale: g.r, scenes: timeline }, null, 2));
  log('recording saved to', dir, cast ? `(${capture.frames.length} frames)` : '');
}

// DEMO_NARRATION=<file>: only write the narration text (for generating the voice), then exit.
if (process.env.DEMO_NARRATION) {
  prepareOsInput();
  fs.writeFileSync(process.env.DEMO_NARRATION, JSON.stringify(narration(), null, 2));
  process.exit(0);
}

// Headless dry run: DEMO_AUTOPLAY=1 plays every scene without waiting for clicks.
boot().then(async () => {
  log('ready — waiting for Start/Next in the teleprompter');
  if (process.env.DEMO_RECORD) {
    await record(process.env.DEMO_RECORD);
    cleanup(); process.exit(0);
  }
  if (process.env.DEMO_AUTOPLAY) {
    for (let i = 1; i <= scenes.length; i++) {
      await play(i);
      if (state.error) log('ERROR in scene', i, state.error);
      await sleep(Number(process.env.DEMO_PAUSE || 800));
    }
    log('autoplay finished');
    if (process.env.DEMO_EXIT) { cleanup(); process.exit(0); }
  }
}).catch((e) => {
  log('boot failed', e);
  state.error = 'Setup failed: ' + e.message;
  publish();
  if (process.env.DEMO_RECORD) { cleanup(); process.exit(1); }
});
