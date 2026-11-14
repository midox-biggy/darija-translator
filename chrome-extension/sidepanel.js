// Side panel: receives selected text, calls the REST endpoint, shows / copies / reads the Darija.
import { loadSettings, saveSettings, translate, health } from './api.js';
import { SOURCE_LANGUAGES, speak, stopSpeaking, isSpeaking, listen, speechRecognitionSupported } from './speech.js';

const $ = (id) => document.getElementById(id);
const els = {
  status: $('status'), statusText: $('statusText'), source: $('source'),
  scriptArabic: $('scriptArabic'), scriptLatin: $('scriptLatin'),
  input: $('input'), count: $('count'), origin: $('origin'),
  translateBtn: $('translateBtn'), micBtn: $('micBtn'), voiceBtn: $('voiceBtn'), clearBtn: $('clearBtn'),
  output: $('output'), meta: $('meta'), speakBtn: $('speakBtn'), copyBtn: $('copyBtn'),
  message: $('message'), history: $('history'), clearHistory: $('clearHistory'),
  liveSelection: $('liveSelection'), autoTranslate: $('autoTranslate'), autoCopy: $('autoCopy'),
};

let settings;
let lastResult = null;       // { translation, script }
let lastPendingAt = 0;       // dedupe hand-offs from the service worker
let inFlight = null;         // AbortController-like token for the current request
let listening = null;        // active speech recognition
let myWindowId;

// ---------- startup ----------

init();

async function init() {
  settings = await loadSettings();
  myWindowId = (await chrome.windows.getCurrent()).id;

  for (const lang of SOURCE_LANGUAGES) {
    els.source.add(new Option(lang.label, lang.id, false, lang.id === settings.source));
  }
  setScript(settings.script, false);
  els.liveSelection.checked = settings.liveSelection;
  els.autoTranslate.checked = settings.autoTranslate;
  els.autoCopy.checked = settings.autoCopy;
  showOutputPlaceholder();
  renderHistory();
  if (!speechRecognitionSupported) {
    els.micBtn.disabled = els.voiceBtn.disabled = true;
    els.micBtn.title = 'Speech recognition is not available in this browser';
  }

  bindEvents();
  refreshStatus();
  setInterval(refreshStatus, 30000);

  // Text handed over by the right-click menu / shortcut while the panel was still opening.
  const { pending } = await chrome.storage.session.get('pending');
  if (pending && Date.now() - pending.at < 15000) receiveText(pending.text, pending.origin, pending.at);
}

function bindEvents() {
  els.translateBtn.addEventListener('click', () => runTranslation());
  els.input.addEventListener('input', updateCount);
  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runTranslation();
  });
  els.clearBtn.addEventListener('click', () => {
    els.input.value = '';
    els.origin.textContent = '';
    updateCount();
    showOutputPlaceholder();
    setMessage('');
    els.input.focus();
  });
  els.source.addEventListener('change', () => persist({ source: els.source.value }));
  els.scriptArabic.addEventListener('click', () => setScript('arabic', true));
  els.scriptLatin.addEventListener('click', () => setScript('latin', true));
  els.speakBtn.addEventListener('click', toggleSpeak);
  els.copyBtn.addEventListener('click', () => copy(lastResult?.translation, true));
  els.micBtn.addEventListener('click', () => dictate(false));
  els.voiceBtn.addEventListener('click', () => dictate(true));
  els.clearHistory.addEventListener('click', async () => {
    await chrome.storage.local.set({ history: [] });
    renderHistory();
  });
  for (const key of ['liveSelection', 'autoTranslate', 'autoCopy']) {
    els[key].addEventListener('change', () => persist({ [key]: els[key].checked }));
  }
  $('settingsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());

  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg.type === 'translate-text') {
      receiveText(msg.text, msg.origin, msg.at);
    } else if (msg.type === 'selection' && settings.liveSelection) {
      // Only follow selections made in the active tab of this panel's window.
      if (sender.tab?.windowId === myWindowId && sender.tab.active) receiveText(msg.text, 'page selection');
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      settings = { ...settings, ...changes.settings.newValue };
      refreshStatus();
    }
  });
}

// ---------- receiving & translating ----------

function receiveText(text, origin, at) {
  if (at) {
    if (at <= lastPendingAt) return;
    lastPendingAt = at;
    chrome.storage.session.remove('pending');
  }
  if (!text?.trim()) return;
  els.input.value = text.trim();                    // auto-paste
  els.origin.textContent = origin ? `· from ${origin}` : '';
  updateCount();
  // The context menu and the shortcut are explicit requests, so they always translate.
  if (settings.autoTranslate || origin === 'context menu' || origin === 'keyboard shortcut') runTranslation();
}

async function runTranslation({ speakAfter = false } = {}) {
  const text = els.input.value.trim();
  if (!text) {
    setMessage('Type, paste or select some text first.');
    return;
  }
  const token = {};
  inFlight = token;
  setBusy(true);
  setMessage('Translating…');
  try {
    const result = await translate(settings, text, els.source.value, settings.script);
    if (inFlight !== token) return;                 // a newer request replaced this one
    lastResult = result;
    showOutput(result);
    setMessage('');
    addToHistory(text, result);
    if (settings.autoCopy) copy(result.translation, false);
    if (speakAfter) startSpeaking();
  } catch (e) {
    if (inFlight !== token) return;
    showError(e);
  } finally {
    if (inFlight === token) setBusy(false);
  }
}

function showOutput(result) {
  els.output.classList.remove('placeholder');
  els.output.textContent = result.translation;
  const rtl = result.script === 'arabic';
  els.output.dir = rtl ? 'rtl' : 'ltr';
  els.output.lang = rtl ? 'ar-MA' : 'en';
  els.meta.textContent = `${result.provider} · ${result.cached ? 'cached' : (result.durationMs / 1000).toFixed(1) + ' s'}`;
  els.speakBtn.disabled = els.copyBtn.disabled = false;
}

function showOutputPlaceholder() {
  lastResult = null;
  els.output.classList.add('placeholder');
  els.output.dir = 'ltr';
  els.output.textContent = 'The Darija translation will appear here.';
  els.meta.textContent = '';
  els.speakBtn.disabled = els.copyBtn.disabled = true;
}

function showError(e) {
  setMessage(e.message, true);
  if (e.status === 401 || e.status === 0) {
    const btn = document.createElement('button');
    btn.className = 'ghost';
    btn.textContent = 'Open settings';
    btn.onclick = () => chrome.runtime.openOptionsPage();
    els.message.append(btn);
  }
  if (e.status === 0) refreshStatus();
}

// ---------- speech ----------

async function toggleSpeak() {
  if (isSpeaking()) {
    stopSpeaking();
    els.speakBtn.textContent = '🔊 Read aloud';
    return;
  }
  startSpeaking();
}

async function startSpeaking() {
  if (!lastResult) return;
  els.speakBtn.textContent = '⏹ Stop';
  const voice = await speak(lastResult.translation, lastResult.script, {
    onEnd: () => (els.speakBtn.textContent = '🔊 Read aloud'),
  });
  if (!voice) setMessage('No Arabic voice is installed on this computer, so the default voice is used.');
}

async function dictate(voiceToVoice) {
  if (listening) {
    listening.stop();
    return;
  }
  const button = voiceToVoice ? els.voiceBtn : els.micBtn;
  const label = button.textContent;
  try {
    listening = listen(els.source.value, { onPartial: (t) => { els.input.value = t; updateCount(); } });
    button.classList.add('active');
    button.textContent = '⏺ Listening… (click to stop)';
    setMessage(`Listening in ${listening.lang}. Speak now.`);
    const text = await listening.promise;
    if (!text) {
      setMessage('I did not hear anything. Try again.');
      return;
    }
    els.input.value = text;
    els.origin.textContent = '· from voice';
    updateCount();
    await runTranslation({ speakAfter: voiceToVoice });
  } catch (e) {
    if (e.code === 'not-allowed' || e.code === 'service-not-allowed') {
      setMessage('Chrome needs permission to use the microphone.', true);
      const btn = document.createElement('button');
      btn.className = 'ghost';
      btn.textContent = 'Allow microphone';
      btn.onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
      els.message.append(btn);
    } else if (e.code === 'no-speech') {
      setMessage('I did not hear anything. Try again.');
    } else {
      setMessage('Voice input failed: ' + (e.code || e.message), true);
    }
  } finally {
    listening = null;
    button.classList.remove('active');
    button.textContent = label;
  }
}

// ---------- helpers ----------

async function copy(text, announce) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    if (announce) setMessage('Copied to the clipboard.');
  } catch {
    setMessage('Could not copy: click inside the panel first, then try again.', true);
  }
}

function setScript(script, save) {
  settings.script = script;
  els.scriptArabic.setAttribute('aria-checked', String(script === 'arabic'));
  els.scriptLatin.setAttribute('aria-checked', String(script === 'latin'));
  if (save) {
    persist({ script });
    if (els.input.value.trim() && lastResult) runTranslation();
  }
}

async function persist(patch) {
  settings = { ...settings, ...patch };
  await saveSettings(settings);
}

function setBusy(busy) {
  els.translateBtn.disabled = busy;
  els.translateBtn.setAttribute('aria-busy', String(busy));
  els.translateBtn.textContent = busy ? 'Translating…' : 'Translate';
}

function setMessage(text, isError = false) {
  els.message.textContent = text;
  els.message.classList.toggle('error', isError);
}

function updateCount() {
  els.count.textContent = `${els.input.value.length} / 5000`;
}

async function refreshStatus() {
  try {
    const h = await health(settings);
    els.status.className = 'status up';
    els.statusText.textContent = 'Online';
    els.status.title = `Server online · ${h.provider} (${h.model})`;
  } catch {
    els.status.className = 'status down';
    els.statusText.textContent = 'Offline';
    els.status.title = `Cannot reach ${settings.serverUrl}`;
  }
}

async function addToHistory(text, result) {
  const { history = [] } = await chrome.storage.local.get('history');
  const entry = { text, translation: result.translation, script: result.script, at: Date.now() };
  const next = [entry, ...history.filter((h) => !(h.text === text && h.script === result.script))].slice(0, 20);
  await chrome.storage.local.set({ history: next });
  renderHistory(next);
}

async function renderHistory(list) {
  const history = list ?? (await chrome.storage.local.get('history')).history ?? [];
  els.history.replaceChildren(...history.map((h) => {
    const li = document.createElement('li');
    const src = document.createElement('span');
    src.className = 'src';
    src.textContent = h.text;
    const dst = document.createElement('span');
    dst.className = 'dst';
    dst.dir = h.script === 'arabic' ? 'rtl' : 'ltr';
    dst.textContent = h.translation;
    li.append(src, dst);
    li.title = 'Show this translation again';
    li.onclick = () => {
      els.input.value = h.text;
      updateCount();
      lastResult = { translation: h.translation, script: h.script, provider: 'history', cached: true };
      showOutput(lastResult);
      els.meta.textContent = 'from history';
    };
    return li;
  }));
  els.clearHistory.hidden = history.length === 0;
}
