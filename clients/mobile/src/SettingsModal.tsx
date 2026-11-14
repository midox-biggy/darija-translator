import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Settings, health, whoAmI } from './api';
import { useTheme } from './theme';

type Props = {
  visible: boolean;
  settings: Settings;
  onSave: (s: Settings) => void;
  onClose: () => void;
};

export function SettingsModal({ visible, settings, onSave, onClose }: Props) {
  const t = useTheme();
  const [draft, setDraft] = useState(settings);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    if (visible) {
      setDraft(settings);
      setMessage(null);
    }
  }, [visible, settings]);

  const field = (key: keyof Settings, label: string, secure = false, hint?: string) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: t.text }]}>{label}</Text>
      <TextInput
        value={draft[key]}
        onChangeText={(v) => setDraft({ ...draft, [key]: v.trim() })}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={key === 'serverUrl' ? 'url' : 'default'}
        style={[styles.input, { color: t.text, borderColor: t.line, backgroundColor: t.card }]}
        placeholderTextColor={t.muted}
      />
      {hint ? <Text style={[styles.hint, { color: t.muted }]}>{hint}</Text> : null}
    </View>
  );

  async function test() {
    setMessage({ text: 'Testing…', error: false });
    try {
      const h = await health(draft);
      const me = await whoAmI(draft);
      setMessage({ text: `Connected as "${me.user}" · ${h.provider} / ${h.model}`, error: false });
    } catch (e: any) {
      setMessage({ text: e.message, error: true });
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.sheet, { backgroundColor: t.bg }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: t.text }]}>Settings</Text>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={10}>
            <Text style={{ color: t.red, fontSize: 16 }}>Close</Text>
          </Pressable>
        </View>
        {field('serverUrl', 'Server URL', false,
          'On a real phone use your computer’s Wi-Fi address, e.g. http://192.168.1.20:8080. The Android emulator uses http://10.0.2.2:8080.')}
        {field('username', 'Username')}
        {field('password', 'Password', true)}
        <View style={styles.row}>
          <Pressable style={[styles.button, { borderColor: t.line }]} onPress={test}>
            <Text style={{ color: t.text }}>Test connection</Text>
          </Pressable>
          <Pressable
            style={[styles.button, { backgroundColor: t.red, borderColor: t.red }]}
            onPress={() => {
              onSave({ ...draft, serverUrl: draft.serverUrl.replace(/\/+$/, '') });
              onClose();
            }}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Save</Text>
          </Pressable>
        </View>
        {message ? (
          <Text style={[styles.message, { color: message.error ? t.red : t.muted, backgroundColor: message.error ? t.errorBg : 'transparent' }]}>
            {message.text}
          </Text>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, padding: 16, gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 22, fontWeight: '700' },
  field: { gap: 4 },
  label: { fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  hint: { fontSize: 12 },
  row: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  button: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  message: { padding: 10, borderRadius: 10 },
});
