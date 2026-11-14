// Darija Translator – React Native (Expo) client for the TranslatorResource REST endpoint.
import * as Clipboard from 'expo-clipboard';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  ApiError, DEFAULT_SETTINGS, HistoryItem, Script, Settings, TranslationResult,
  clearHistory, health, loadHistory, loadSettings, pushHistory, saveSettings, translate,
} from './src/api';
import { SettingsModal } from './src/SettingsModal';
import { speak, stopSpeaking } from './src/speech';
import { useTheme } from './src/theme';

const SOURCES = [
  { id: 'auto', label: 'Detect' },
  { id: 'English', label: 'English' },
  { id: 'French', label: 'French' },
  { id: 'Modern Standard Arabic', label: 'Fusha' },
  { id: 'Spanish', label: 'Spanish' },
  { id: 'German', label: 'German' },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <TranslatorScreen />
    </SafeAreaProvider>
  );
}

function TranslatorScreen() {
  const t = useTheme();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [online, setOnline] = useState<boolean | null>(null);
  const [text, setText] = useState('');
  const [source, setSource] = useState('auto');
  const [script, setScript] = useState<Script>('arabic');
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [clipboardHasText, setClipboardHasText] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const requestId = useRef(0);

  // ----- startup: settings, history, server status, clipboard -----
  useEffect(() => {
    loadSettings().then(setSettings);
    loadHistory().then(setHistory);
  }, []);

  const refreshStatus = useCallback(async (s: Settings) => {
    try {
      await health(s);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus(settings);
  }, [settings, refreshStatus]);

  // When the user comes back to the app (e.g. after copying text elsewhere), offer to paste it.
  useEffect(() => {
    const check = () => Clipboard.hasStringAsync().then(setClipboardHasText).catch(() => setClipboardHasText(false));
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        check();
        refreshStatus(settings);
      }
    });
    return () => sub.remove();
  }, [settings, refreshStatus]);

  // ----- actions -----
  async function runTranslation(input = text, nextScript = script) {
    const clean = input.trim();
    if (!clean) {
      setError('Type or paste some text first.');
      return;
    }
    const id = ++requestId.current;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await translate(settings, clean, source, nextScript);
      if (id !== requestId.current) return;
      setResult(r);
      setOnline(true);
      setHistory(await pushHistory({ text: clean, translation: r.translation, script: r.script, at: Date.now() }));
    } catch (e) {
      if (id !== requestId.current) return;
      const err = e as ApiError;
      setError(err.message);
      if (err.status === 0) setOnline(false);
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }

  async function pasteAndTranslate() {
    const clip = (await Clipboard.getStringAsync()).trim();
    if (!clip) {
      setNotice('The clipboard is empty.');
      return;
    }
    setText(clip.slice(0, 5000));
    runTranslation(clip.slice(0, 5000));
  }

  async function toggleSpeak() {
    if (!result) return;
    if (speaking) {
      await stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    speak(result.translation, result.script, () => setSpeaking(false));
  }

  async function copy() {
    if (!result) return;
    await Clipboard.setStringAsync(result.translation);
    setNotice('Copied to the clipboard.');
  }

  function changeScript(next: Script) {
    setScript(next);
    if (result && text.trim()) runTranslation(text, next);
  }

  const rtl = result?.script === 'arabic';
  const s = styles(t);

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <StatusBar style="auto" />
      <View style={s.header}>
        <Text style={s.title}>Darija Translator</Text>
        <View style={s.status}>
          <View style={[s.dot, { backgroundColor: online === null ? t.muted : online ? t.ok : t.red }]} />
          <Text style={s.muted}>{online === null ? '…' : online ? 'Online' : 'Offline'}</Text>
        </View>
        <Pressable onPress={() => setSettingsOpen(true)} accessibilityLabel="Settings" hitSlop={10}>
          <Text style={s.gear}>⚙</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            {SOURCES.map((l) => (
              <Pressable key={l.id} onPress={() => setSource(l.id)}
                style={[s.chip, source === l.id && { backgroundColor: t.green, borderColor: t.green }]}>
                <Text style={[s.chipText, source === l.id && { color: '#fff' }]}>{l.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={s.card}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Text to translate into Darija…"
              placeholderTextColor={t.muted}
              multiline
              maxLength={5000}
              style={s.input}
              textAlignVertical="top"
            />
            <View style={s.row}>
              {clipboardHasText ? (
                <Pressable style={s.ghost} onPress={pasteAndTranslate}>
                  <Text style={s.ghostText}>📋 Paste & translate</Text>
                </Pressable>
              ) : null}
              {text ? (
                <Pressable style={s.ghost} onPress={() => { setText(''); setResult(null); setError(null); }}>
                  <Text style={s.ghostText}>Clear</Text>
                </Pressable>
              ) : null}
              <Text style={[s.muted, { marginLeft: 'auto' }]}>{text.length}/5000</Text>
            </View>
            <View style={s.row}>
              <View style={s.segment}>
                {(['arabic', 'latin'] as Script[]).map((k) => (
                  <Pressable key={k} onPress={() => changeScript(k)}
                    style={[s.segmentItem, script === k && { backgroundColor: t.green }]}>
                    <Text style={[s.chipText, script === k && { color: '#fff' }]}>{k === 'arabic' ? 'العربية' : 'Latin'}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable style={[s.primary, busy && { opacity: 0.7 }]} onPress={() => runTranslation()} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Translate</Text>}
              </Pressable>
            </View>
          </View>

          {error ? <Text style={s.error}>{error}</Text> : null}
          {notice ? <Text style={s.muted}>{notice}</Text> : null}

          {result ? (
            <View style={s.card}>
              <Text selectable style={[s.output, rtl ? { writingDirection: 'rtl', textAlign: 'right' } : { fontSize: 18 }]}>
                {result.translation}
              </Text>
              <View style={s.row}>
                <Pressable style={s.ghost} onPress={toggleSpeak}><Text style={s.ghostText}>{speaking ? '⏹ Stop' : '🔊 Read aloud'}</Text></Pressable>
                <Pressable style={s.ghost} onPress={copy}><Text style={s.ghostText}>Copy</Text></Pressable>
                <Pressable style={s.ghost} onPress={() => Share.share({ message: result.translation })}><Text style={s.ghostText}>Share</Text></Pressable>
              </View>
              <Text style={s.muted}>
                {result.provider}/{result.model} · {result.cached ? 'cached' : `${(result.durationMs / 1000).toFixed(1)} s`}
              </Text>
            </View>
          ) : null}

          {history.length > 0 ? (
            <View style={{ gap: 8 }}>
              <View style={s.row}>
                <Text style={s.section}>Recent</Text>
                <Pressable style={{ marginLeft: 'auto' }} onPress={async () => { await clearHistory(); setHistory([]); }}>
                  <Text style={{ color: t.red }}>Clear</Text>
                </Pressable>
              </View>
              {history.map((h) => (
                <Pressable key={h.at} style={s.historyItem} onPress={() => {
                  setText(h.text);
                  setResult({ translation: h.translation, script: h.script, source: 'auto', provider: 'history', model: 'saved', cached: true, durationMs: 0, user: null });
                }}>
                  <Text style={s.muted} numberOfLines={1}>{h.text}</Text>
                  <Text style={[{ color: t.text, fontSize: 16 }, h.script === 'arabic' && { writingDirection: 'rtl', textAlign: 'right' }]} numberOfLines={2}>
                    {h.translation}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <SettingsModal
        visible={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={async (next) => {
          setSettings(next);
          await saveSettings(next);
        }}
      />
    </SafeAreaView>
  );
}

const styles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12,
      backgroundColor: t.card, borderBottomWidth: 3, borderBottomColor: t.red,
    },
    title: { flex: 1, fontSize: 19, fontWeight: '700', color: t.text },
    status: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    dot: { width: 9, height: 9, borderRadius: 5 },
    gear: { fontSize: 22, color: t.muted },
    body: { padding: 16, gap: 14, paddingBottom: 48 },
    chips: { gap: 8 },
    chip: { borderWidth: 1, borderColor: t.line, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: t.card },
    chipText: { color: t.text, fontSize: 14 },
    card: { backgroundColor: t.card, borderRadius: 14, borderWidth: 1, borderColor: t.line, padding: 12, gap: 10 },
    input: { minHeight: 120, fontSize: 17, color: t.text },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    segment: { flexDirection: 'row', borderWidth: 1, borderColor: t.line, borderRadius: 10, overflow: 'hidden' },
    segmentItem: { paddingHorizontal: 14, paddingVertical: 8 },
    primary: { marginLeft: 'auto', backgroundColor: t.red, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 10, minWidth: 120, alignItems: 'center' },
    primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    ghost: { borderWidth: 1, borderColor: t.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
    ghostText: { color: t.text },
    output: { fontSize: 24, lineHeight: 38, color: t.text },
    muted: { color: t.muted, fontSize: 13 },
    error: { color: t.red, backgroundColor: t.errorBg, padding: 10, borderRadius: 10, overflow: 'hidden' },
    section: { fontWeight: '700', color: t.text, fontSize: 16 },
    historyItem: { backgroundColor: t.card, borderRadius: 10, borderWidth: 1, borderColor: t.line, padding: 10, gap: 4 },
  });
