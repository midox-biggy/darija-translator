// Speech features: read aloud (text-to-speech) and voice input (speech-to-text), using the
// Web Speech API built into Chrome. Together they give voice-to-voice translation.

export const SOURCE_LANGUAGES = [
  { id: 'auto', label: 'Detect language', speech: null },
  { id: 'English', label: 'English', speech: 'en-US' },
  { id: 'French', label: 'French', speech: 'fr-FR' },
  { id: 'Modern Standard Arabic', label: 'Arabic (Fusha)', speech: 'ar-SA' },
  { id: 'Spanish', label: 'Spanish', speech: 'es-ES' },
  { id: 'German', label: 'German', speech: 'de-DE' },
  { id: 'Italian', label: 'Italian', speech: 'it-IT' },
  { id: 'Portuguese', label: 'Portuguese', speech: 'pt-PT' },
  { id: 'Tamazight', label: 'Tamazight', speech: null },
];

// ---------- Text to speech ----------

function voicesReady() {
  const voices = speechSynthesis.getVoices();
  if (voices.length) return Promise.resolve(voices);
  return new Promise((resolve) => {
    speechSynthesis.addEventListener('voiceschanged', () => resolve(speechSynthesis.getVoices()), { once: true });
    setTimeout(() => resolve(speechSynthesis.getVoices()), 1500);
  });
}

/** Best voice for Darija: a Moroccan Arabic voice if installed, otherwise any Arabic voice.
 *  Latin-script Darija (Arabizi) is read with a French voice, which pronounces it reasonably. */
async function pickVoice(script) {
  const voices = await voicesReady();
  const prefs = script === 'latin' ? ['fr-MA', 'fr-FR', 'fr'] : ['ar-MA', 'ar-DZ', 'ar-TN', 'ar-SA', 'ar'];
  for (const p of prefs) {
    const v = voices.find((x) => x.lang.replace('_', '-').toLowerCase().startsWith(p.toLowerCase()));
    if (v) return v;
  }
  return null;
}

export function isSpeaking() {
  return speechSynthesis.speaking;
}

export function stopSpeaking() {
  speechSynthesis.cancel();
}

/** Reads text aloud. Resolves when finished. Returns the voice name used (or null if none found). */
export async function speak(text, script, { onEnd } = {}) {
  stopSpeaking();
  const voice = await pickVoice(script);
  // Chrome stops long utterances after ~15 s, so speak sentence by sentence.
  const chunks = text.match(/[^.!?؟\n]+[.!?؟]*\s*|\n+/g)?.filter((c) => c.trim()) ?? [text];
  chunks.forEach((chunk, i) => {
    const u = new SpeechSynthesisUtterance(chunk);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = script === 'latin' ? 'fr-FR' : 'ar-MA';
    }
    u.rate = 0.95;
    if (i === chunks.length - 1 && onEnd) {
      u.onend = onEnd;
      u.onerror = onEnd;
    }
    speechSynthesis.speak(u);
  });
  return voice?.name ?? null;
}

// ---------- Speech to text ----------

export const speechRecognitionSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;

/**
 * Listens to the microphone once and resolves with the final transcript.
 * onPartial receives the live (interim) transcript while the user talks.
 * Rejects with an Error whose .code is the Web Speech error (e.g. 'not-allowed', 'no-speech').
 */
export function listen(sourceId, { onPartial } = {}) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const lang = SOURCE_LANGUAGES.find((l) => l.id === sourceId)?.speech || navigator.language || 'en-US';
  const rec = new Recognition();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  const promise = new Promise((resolve, reject) => {
    let finalText = '';
    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      onPartial?.((finalText + interim).trim());
    };
    rec.onerror = (event) => {
      const err = new Error(event.error);
      err.code = event.error;
      reject(err);
    };
    rec.onend = () => resolve(finalText.trim());
  });
  rec.start();
  return { promise, stop: () => rec.stop(), lang };
}
