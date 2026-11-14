// Settings + calls to the Darija Translator REST service. Shared by the side panel and the options page.

export const DEFAULTS = {
  serverUrl: 'http://localhost:8080',
  username: 'student',
  password: 'darija2026',
  source: 'auto',
  script: 'arabic',
  liveSelection: true,   // paste text as soon as it is selected on the page
  autoTranslate: true,   // translate pasted text right away
  autoCopy: false,       // copy each translation to the clipboard
};

export async function loadSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULTS, ...(settings || {}) };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** UTF-8 safe Base64, so non-ASCII usernames/passwords work in the Basic header. */
function base64(text) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)));
}

async function call(settings, path, { method = 'GET', body, auth = true, timeoutMs = 90000 } = {}) {
  const url = settings.serverUrl.replace(/\/+$/, '') + path;
  // X-Requested-With tells the server not to send WWW-Authenticate, so Chrome never pops up its own login box.
  const headers = { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' };
  if (auth) headers.Authorization = 'Basic ' + base64(`${settings.username}:${settings.password}`);
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e.name === 'TimeoutError') throw new ApiError(0, 'The server took too long to answer.');
    throw new ApiError(0, `Cannot reach the server at ${settings.serverUrl}. Is it running?`);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const fallback = response.status === 401 ? 'Wrong username or password (check Settings).' : response.statusText;
    throw new ApiError(response.status, data?.message || fallback || `HTTP ${response.status}`);
  }
  return data;
}

/** POST /api/translator/translate — the TranslatorResource.translate() business method. */
export function translate(settings, text, source, script) {
  return call(settings, '/api/translator/translate', { method: 'POST', body: { text, source, script } });
}

/** GET /api/health — public, no credentials. */
export function health(settings) {
  return call(settings, '/api/health', { auth: false, timeoutMs: 5000 });
}

/** GET /api/translator/me — checks the credentials without spending LLM quota. */
export function whoAmI(settings) {
  return call(settings, '/api/translator/me', { timeoutMs: 8000 });
}
