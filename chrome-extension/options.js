import { loadSettings, saveSettings, health, whoAmI } from './api.js';

const form = document.getElementById('form');
const fields = ['serverUrl', 'username', 'password'];
const result = document.getElementById('result');

let settings = await loadSettings();
for (const f of fields) document.getElementById(f).value = settings[f];

function read() {
  const next = { ...settings };
  for (const f of fields) next[f] = document.getElementById(f).value.trim();
  next.serverUrl = next.serverUrl.replace(/\/+$/, '');
  return next;
}

function say(text, isError = false) {
  result.textContent = text;
  result.classList.toggle('error', isError);
}

/** localhost is allowed by the manifest; any other host needs the user's OK once. */
async function ensureHostPermission(serverUrl) {
  const url = new URL(serverUrl);
  if (['localhost', '127.0.0.1'].includes(url.hostname)) return true;
  return chrome.permissions.request({ origins: [`${url.protocol}//${url.hostname}/*`] });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const next = read();
  if (!(await ensureHostPermission(next.serverUrl))) {
    say('Chrome needs permission to contact that server. Settings not saved.', true);
    return;
  }
  settings = next;
  await saveSettings(settings);
  say('Saved.');
});

document.getElementById('test').addEventListener('click', async () => {
  const candidate = read();
  if (!(await ensureHostPermission(candidate.serverUrl))) {
    say('Chrome needs permission to contact that server.', true);
    return;
  }
  say('Testing…');
  try {
    const h = await health(candidate);
    const me = await whoAmI(candidate);
    say(`Connected. Logged in as "${me.user}". Model: ${h.provider} / ${h.model}.`);
  } catch (err) {
    say(err.message, true);
  }
});
