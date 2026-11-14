// Read aloud with expo-speech, preferring a Moroccan / Arabic voice.
import * as Speech from 'expo-speech';
import type { Script } from './api';

let cachedVoices: Speech.Voice[] | null = null;

async function pickVoice(script: Script): Promise<Speech.Voice | undefined> {
  cachedVoices ??= await Speech.getAvailableVoicesAsync().catch(() => []);
  const prefs = script === 'latin' ? ['fr-MA', 'fr-FR', 'fr'] : ['ar-MA', 'ar-SA', 'ar'];
  for (const p of prefs) {
    const v = cachedVoices.find((x) => x.language.replace('_', '-').toLowerCase().startsWith(p.toLowerCase()));
    if (v) return v;
  }
  return undefined;
}

export async function speak(text: string, script: Script, onDone: () => void) {
  await Speech.stop();
  const voice = await pickVoice(script);
  Speech.speak(text, {
    voice: voice?.identifier,
    language: voice?.language ?? (script === 'latin' ? 'fr-FR' : 'ar'),
    rate: 0.95,
    onDone,
    onStopped: onDone,
    onError: onDone,
  });
}

export function stopSpeaking() {
  return Speech.stop();
}
