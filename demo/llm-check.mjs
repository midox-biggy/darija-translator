// Reads the server's LLM settings (env or server/config.properties) and sends one tiny request,
// so the model is loaded and warm before recording starts.
import fs from 'node:fs';
import path from 'node:path';

export async function warmUp(root) {
  const file = path.join(root, 'server/config.properties');
  const props = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && m[2]) props[m[1]] = m[2];
    }
  }
  const get = (k, d) => process.env[k] || props[k] || d;
  const provider = get('LLM_PROVIDER', 'gemini');
  const t0 = Date.now();
  if (provider === 'gemini') {
    const key = get('GEMINI_API_KEY', '');
    if (!key) return { ok: false, detail: 'GEMINI_API_KEY is not set (server/config.properties)' };
    const model = get('GEMINI_MODEL', 'gemini-flash-latest');
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with OK' }] }] }),
    });
    return { ok: r.ok, detail: `gemini / ${model} ${r.ok ? `answered in ${Date.now() - t0} ms` : 'HTTP ' + r.status}` };
  }
  const base = get('OPENAI_BASE_URL', provider === 'lmstudio' ? 'http://localhost:1234/v1' : 'http://localhost:11434/v1').replace(/\/+$/, '');
  const model = get('OPENAI_MODEL', 'qwen2.5:3b');
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with OK' }], max_tokens: 5 }),
    signal: AbortSignal.timeout(180000),
  });
  return { ok: r.ok, detail: `${provider} / ${model} ${r.ok ? `answered in ${Date.now() - t0} ms` : 'HTTP ' + r.status}` };
}
