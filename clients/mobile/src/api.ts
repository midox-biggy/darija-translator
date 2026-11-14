// Calls to the Darija Translator REST service (TranslatorResource) with HTTP Basic authentication.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export type Script = 'arabic' | 'latin';

export type Settings = {
  serverUrl: string;
  username: string;
  password: string;
};

export type TranslationResult = {
  translation: string;
  source: string;
  script: Script;
  provider: string;
  model: string;
  cached: boolean;
  durationMs: number;
  user: string | null;
};

export type Health = { status: string; provider: string; model: string };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// The Android emulator reaches the host computer at 10.0.2.2. On a real phone, set your
// computer's LAN address (e.g. http://192.168.1.20:8080) in Settings.
export const DEFAULT_SETTINGS: Settings = {
  serverUrl: Platform.OS === 'android' ? 'http://10.0.2.2:8080' : 'http://localhost:8080',
  username: 'student',
  password: 'darija2026',
};

const SETTINGS_KEY = 'darija.settings';

export async function loadSettings(): Promise<Settings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/** UTF-8 safe Base64 for the Basic header. */
function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

async function call<T>(settings: Settings, path: string, init: { method?: string; body?: unknown; auth?: boolean; timeoutMs?: number } = {}): Promise<T> {
  const { method = 'GET', body, auth = true, timeoutMs = 90000 } = init;
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Requested-With': 'ReactNative' };
  if (auth) headers.Authorization = 'Basic ' + base64(`${settings.username}:${settings.password}`);
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(settings.serverUrl.replace(/\/+$/, '') + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, `Cannot reach ${settings.serverUrl}. Check the server address in Settings.`);
  } finally {
    clearTimeout(timer);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const fallback = response.status === 401 ? 'Wrong username or password.' : `HTTP ${response.status}`;
    throw new ApiError(response.status, data?.message ?? fallback);
  }
  return data as T;
}

export function translate(settings: Settings, text: string, source: string, script: Script) {
  return call<TranslationResult>(settings, '/api/translator/translate', { method: 'POST', body: { text, source, script } });
}

export function health(settings: Settings) {
  return call<Health>(settings, '/api/health', { auth: false, timeoutMs: 5000 });
}

export function whoAmI(settings: Settings) {
  return call<{ user: string }>(settings, '/api/translator/me', { timeoutMs: 8000 });
}

// ---------- history ----------

export type HistoryItem = { text: string; translation: string; script: Script; at: number };
const HISTORY_KEY = 'darija.history';

export async function loadHistory(): Promise<HistoryItem[]> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function pushHistory(item: HistoryItem): Promise<HistoryItem[]> {
  const list = await loadHistory();
  const next = [item, ...list.filter((h) => !(h.text === item.text && h.script === item.script))].slice(0, 15);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

export async function clearHistory(): Promise<void> {
  await AsyncStorage.removeItem(HISTORY_KEY);
}
